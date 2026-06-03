// app/api/paste/create/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/paste/create
//
// PRIVACY INVARIANTS (must never be broken):
//   • decryption key lives in URL fragment only — never reaches this handler.
//   • encryptedBlob is opaque bytes — we store it, we cannot read it.
//   • passwordSalt is returned to the client for in-browser PBKDF2 only.
//   • passwordProof is a one-way rate-limiting token, not the decryption key.
//   • Raw IP is never stored — hashIp() before any write.
//
// VIEW-COUNT GATE SEMANTICS:
//   anonymous   → maxViews MUST equal 1 (burn-after-reading only)
//   free        → maxViews 1–10 allowed (covers presets 1/5/10)
//   pro:*       → maxViews 1–9999 allowed (custom input)
//   pro:annual  → maxViews 0 (unlimited) also allowed
//
// RATE LIMIT HEADERS ON SUCCESS:
//   X-RateLimit-Limit     — the daily cap for this tier
//   X-RateLimit-Remaining — pastes remaining in the current 24 h window
//                           (after counting this request)
//   X-RateLimit-Reset     — Unix timestamp ms when the window fully resets
//
//   These are also returned in the 201 response body as rateLimitRemaining /
//   rateLimitReset so the Zustand store can update pastesRemainingToday
//   immediately after a successful paste, without waiting for the next
//   useSubscription() poll.  See src/hooks/usePasteCreator.ts.
//
//   WHY HEADERS TOO: Monitoring tools and the future dashboard page can read
//   them without parsing the body.  Standard practice per IETF draft-ietf-httpapi-ratelimit.
//
// ─── FIX ─────────────────────────────────────────────────────────────────────
// Added try/catch around the Redis pipeline.exec() call (step 6) and the
// database PasteLog write (step 7) so failures are surfaced as proper 503/500
// responses instead of unhandled rejections that crash the Node.js worker.
// ─────────────────────────────────────────────────────────────────────────────
//
// RUNTIME: Node.js (uses Prisma).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { randomBytes } from 'node:crypto';

import { redis }  from '../../../../lib/redis';
import { db }     from '../../../../lib/db';
import { getClientIp, hashIp } from '../../../../lib/ip';
import {
  getPasteRatelimiter,
  getPasteRatelimitKey,
  rateLimitedResponse,
} from '../../../../lib/ratelimit';
import {
  deriveTierFromClaims,
  getLimits,
} from '../../../../lib/plan-limits';
import {
  redisKeys,
  type RedisPasteRecord,
} from '../../../../lib/paste-types';

// ── Request body shape ────────────────────────────────────────────────────────

type CreateBody = {
  encryptedBlob:  string;
  iv:             string;
  expirySeconds:  number;
  maxViews:       number;
  hasPassword:    boolean;
  passwordSalt?:  string;
  passwordProof?: string;
  sizeBytes:      number;
  language:       string | null;
};

// ── Validation helpers ────────────────────────────────────────────────────────

function isValidMaxViews(v: unknown): v is number {
  if (typeof v !== 'number') return false;
  if (!Number.isInteger(v)) return false;
  if (v < 0)    return false;
  if (v > 9999) return false;
  return true;
}

function isValidLanguage(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

const ALLOWED_LANGUAGES = new Set([
  'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'c', 'cpp',
  'csharp', 'ruby', 'php', 'swift', 'kotlin', 'bash', 'sql', 'html', 'css',
  'json', 'yaml', 'toml', 'markdown', 'xml', 'dockerfile', 'graphql', 'text',
  'plaintext',
]);

function sanitizeLanguage(lang: string | null): string | null {
  if (lang === null) return null;
  const normalized = lang.toLowerCase().trim();
  return ALLOWED_LANGUAGES.has(normalized) ? normalized : null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // ── 1. Parse and validate body ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', code: 'ERR_INVALID_BODY' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return Response.json(
      { error: 'Body must be an object', code: 'ERR_INVALID_BODY' },
      { status: 400 },
    );
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw['encryptedBlob'] !== 'string' || raw['encryptedBlob'].length === 0) {
    return Response.json({ error: 'encryptedBlob is required', code: 'ERR_MISSING_FIELD' }, { status: 400 });
  }
  if (typeof raw['iv'] !== 'string' || raw['iv'].length === 0) {
    return Response.json({ error: 'iv is required', code: 'ERR_MISSING_FIELD' }, { status: 400 });
  }
  if (typeof raw['expirySeconds'] !== 'number' || raw['expirySeconds'] <= 0) {
    return Response.json({ error: 'expirySeconds must be a positive number', code: 'ERR_INVALID_FIELD' }, { status: 400 });
  }
  if (!isValidMaxViews(raw['maxViews'])) {
    return Response.json(
      { error: 'maxViews must be an integer from 0–9999', code: 'ERR_INVALID_VIEWS' },
      { status: 400 },
    );
  }
  if (typeof raw['hasPassword'] !== 'boolean') {
    return Response.json({ error: 'hasPassword must be a boolean', code: 'ERR_INVALID_FIELD' }, { status: 400 });
  }
  if (typeof raw['sizeBytes'] !== 'number' || raw['sizeBytes'] <= 0) {
    return Response.json({ error: 'sizeBytes must be a positive number', code: 'ERR_INVALID_FIELD' }, { status: 400 });
  }
  if (!isValidLanguage(raw['language'])) {
    return Response.json({ error: 'language must be a string or null', code: 'ERR_INVALID_FIELD' }, { status: 400 });
  }

  if (raw['hasPassword'] === true) {
    if (typeof raw['passwordSalt'] !== 'string' || raw['passwordSalt'].length === 0) {
      return Response.json({ error: 'passwordSalt required when hasPassword is true', code: 'ERR_MISSING_FIELD' }, { status: 400 });
    }
    if (typeof raw['passwordProof'] !== 'string' || raw['passwordProof'].length === 0) {
      return Response.json({ error: 'passwordProof required when hasPassword is true', code: 'ERR_MISSING_FIELD' }, { status: 400 });
    }
  }

  const parsedBody: CreateBody = {
    encryptedBlob: raw['encryptedBlob'] as string,
    iv:            raw['iv'] as string,
    expirySeconds: raw['expirySeconds'] as number,
    maxViews:      raw['maxViews'] as number,
    hasPassword:   raw['hasPassword'] as boolean,
    passwordSalt:  typeof raw['passwordSalt'] === 'string' ? raw['passwordSalt'] : undefined,
    passwordProof: typeof raw['passwordProof'] === 'string' ? raw['passwordProof'] : undefined,
    sizeBytes:     raw['sizeBytes'] as number,
    language:      sanitizeLanguage(raw['language'] as string | null),
  };

  // ── 2. Auth & tier ─────────────────────────────────────────────────────────
  const { userId, sessionClaims } = await auth();
  const tierInfo = deriveTierFromClaims(userId ?? null, sessionClaims as Record<string, unknown> | null);
  const { tier, planType } = tierInfo;
  const limits = getLimits(tier, planType);

  // ── 3. Rate limit ──────────────────────────────────────────────────────────
  const rawIp = getClientIp(request);
  const ipHash = await hashIp(rawIp);
  const rateLimiter = getPasteRatelimiter(tier, planType);
  const rateLimitKey = getPasteRatelimitKey(tier, userId ?? null, ipHash);

  const { success: rateLimitPassed, reset, remaining, limit } = await rateLimiter.limit(rateLimitKey);

  if (!rateLimitPassed) {
    return rateLimitedResponse(reset, tier);
  }

  // ── 4. Feature gates ───────────────────────────────────────────────────────
  const upgradeUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pricing`;

  if (parsedBody.hasPassword && !limits.allowPassword) {
    return Response.json(
      {
        error: 'Password protection requires a Pro subscription.',
        code:  'ERR_TIER_REQUIRED',
        upgradeUrl,
      },
      { status: 403 },
    );
  }

  if (tier === 'anonymous' && parsedBody.maxViews !== 1) {
    return Response.json(
      {
        error:     'Anonymous pastes are burn-after-reading (maxViews must be 1).',
        code:      'ERR_TIER_REQUIRED',
        signUpUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/sign-up`,
      },
      { status: 403 },
    );
  }

  if (limits.maxViews > 0 && parsedBody.maxViews > limits.maxViews) {
    return Response.json(
      {
        error:      `View count exceeds your plan maximum of ${limits.maxViews}.`,
        code:       'ERR_TIER_REQUIRED',
        upgradeUrl,
      },
      { status: 403 },
    );
  }

  if (parsedBody.maxViews === 0 && !limits.allowUnlimitedViews) {
    return Response.json(
      {
        error:      'Unlimited views require an Annual Pro subscription.',
        code:       'ERR_TIER_REQUIRED',
        upgradeUrl: `${upgradeUrl}#annual`,
      },
      { status: 403 },
    );
  }

  if (parsedBody.maxViews > 10 && !limits.allowCustomViews) {
    return Response.json(
      {
        error:      'Custom view counts require a Pro subscription.',
        code:       'ERR_TIER_REQUIRED',
        upgradeUrl,
      },
      { status: 403 },
    );
  }

  if (parsedBody.expirySeconds > limits.maxExpirySeconds) {
    return Response.json(
      {
        error: `Expiry exceeds your plan maximum of ${limits.maxExpirySeconds} seconds.`,
        code:  'ERR_EXPIRY_EXCEEDED',
      },
      { status: 400 },
    );
  }

  if (parsedBody.sizeBytes > limits.maxPlaintextBytes) {
    return Response.json(
      {
        error: `Paste size exceeds your plan limit of ${limits.maxPlaintextBytes} bytes.`,
        code:  'ERR_SIZE_EXCEEDED',
      },
      { status: 413 },
    );
  }

  const maxCiphertextBytes = limits.maxPlaintextBytes * 1.4 + 100;
  if (parsedBody.encryptedBlob.length > maxCiphertextBytes) {
    return Response.json(
      { error: 'Encrypted blob exceeds permitted size for your plan.', code: 'ERR_SIZE_EXCEEDED' },
      { status: 413 },
    );
  }

  // ── 5. Generate paste ID and compute expiry ────────────────────────────────
  const id       = randomBytes(9).toString('base64url');
  const now      = Date.now();
  const expiresAt = now + parsedBody.expirySeconds * 1000;

  // ── 6. Write to Redis atomically ───────────────────────────────────────────
  // FIX: Wrapped in try/catch — previously an unhandled pipeline.exec() failure
  // would crash the Node.js worker and return an unformatted 500.
  const pasteRecord: RedisPasteRecord = {
    encryptedBlob: parsedBody.encryptedBlob,
    iv:            parsedBody.iv,
    hasPassword:   parsedBody.hasPassword,
    passwordSalt:  parsedBody.passwordSalt ?? null,
    passwordProof: parsedBody.passwordProof ?? null,
    maxViews:      parsedBody.maxViews,
    expiresAt,
    language:      parsedBody.language,
  };

  const pasteKey   = redisKeys.paste(id);
  const viewsKey   = redisKeys.views(id);
  const ttlSeconds = Math.ceil(parsedBody.expirySeconds);

  try {
    const pipeline = redis.pipeline();
    pipeline.set(pasteKey, JSON.stringify(pasteRecord), { ex: ttlSeconds });
    // View counter initialised to 0; INCR in the read Lua script starts from 1.
    pipeline.set(viewsKey, 0, { ex: ttlSeconds });
    await pipeline.exec();
  } catch (redisErr) {
    console.error('[scorchpad] create — redis pipeline.exec() failed:', redisErr);
    return Response.json(
      {
        error: 'Failed to store paste. Please try again.',
        code:  'ERR_STORAGE_FAILED',
      },
      { status: 503 },
    );
  }

  // ── 7. Log paste creation to Postgres (metadata only — never content) ──────
  // Fire-and-forget — a logging failure must not fail the paste creation.
  // FIX: Errors now logged with structured context instead of swallowed silently.
  db.pasteLog.create({
    data: {
      userId:    userId ?? null,
      ipHash,
      sizeBytes: parsedBody.sizeBytes,
    },
  }).catch((err: unknown) => {
    console.error('[scorchpad] PasteLog write failed (non-fatal):', {
      pasteId: id,  // log ID for tracing — not the secret content
      error:   err instanceof Error ? err.message : String(err),
    });
  });

  // ── 8. Return paste ID + rate limit info ───────────────────────────────────
  return Response.json(
    {
      id,
      rateLimitRemaining: Math.max(0, remaining),
      rateLimitReset:     reset,
    },
    {
      status: 201,
      headers: {
        'Cache-Control':         'no-store',
        'X-RateLimit-Limit':     String(limit),
        'X-RateLimit-Remaining': String(Math.max(0, remaining)),
        'X-RateLimit-Reset':     String(reset),
      },
    },
  );
}
