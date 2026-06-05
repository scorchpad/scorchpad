// app/api/paste/create/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/paste/create
//
// PRIVACY INVARIANTS (must never be broken):
//   • decryption key lives in URL fragment only — never reaches this handler.
//   • encryptedBlob is opaque bytes — we store it, we cannot read it.
//   • passwordSalt is returned to the client for in-browser PBKDF2 only.
//   • Raw IP is never stored — hashIp() before any write.
//
// SECURITY FIXES (this version):
//
//   FIX #3 — IV must decode to exactly 12 bytes:
//     isValidIv() enforces /^[A-Za-z0-9_-]{16}$/ — the only valid encoding
//     for exactly 12 bytes in URL-safe base64.
//
//   FIX #4 — expirySeconds strict whitelist per tier:
//     isAllowedExpiry() from lib/plan-limits.ts checks against a Set<number>
//     per tier. Only exact allowed values pass.
//
//   FIX #8 — sizeBytes computed server-side for PasteLog.
//
//   FIX H1 — passwordProof REMOVED:
//     OLD: The client sent passwordProof = HMAC-SHA256(password, passwordSalt).
//          The server stored it in Redis for server-side rate-limiting.
//          A Redis dump gave attackers a fast (1× HMAC) offline brute-force
//          oracle — rendering the 310,000-iteration PBKDF2 worthless.
//     NEW: passwordProof is no longer accepted in the request body. Any request
//          body containing passwordProof is rejected with ERR_INVALID_FIELD.
//          The global per-paste attempt counter (pv:pwattempts:{id}) is the
//          only brute-force gate. See verify-password/route.ts for full detail.
//
//   FIX S1 — passwordSalt format validation:
//     OLD: passwordSalt was accepted as any non-empty string. A saboteur could
//          POST a malformed or truncated salt that passes creation but causes
//          every legitimate recipient to fail PBKDF2 derivation, effectively
//          destroying the paste silently.
//     NEW: passwordSalt must match /^[A-Za-z0-9_-]{43}$/ — the only valid
//          URL-safe base64url encoding of exactly 32 bytes (the length generated
//          by crypto.getRandomValues(new Uint8Array(32)) in the client).
//          32 bytes → ceil(32/3)×4 with no padding = 43 chars exactly.
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
  isAllowedExpiry,
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
  /** Client-supplied plaintext size — used ONLY for tier gate, NOT for logging. */
  sizeBytes:      number;
  language:       string | null;
};

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * FIX #3: Validates that IV is exactly the URL-safe base64 encoding of 12 bytes.
 *
 * AES-GCM requires a 12-byte (96-bit) IV. In URL-safe base64 (no padding):
 *   12 bytes × (4/3) = 16 chars exactly (12 is divisible by 3 so no '=' padding).
 */
function isValidIv(iv: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(iv);
}

/**
 * Validates encryptedBlob or passwordSalt contains only URL-safe base64 chars.
 */
function isValidBase64Url(s: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(s);
}

/**
 * FIX S1: Validates passwordSalt is exactly the URL-safe base64url encoding of
 * 32 bytes. The client generates: crypto.getRandomValues(new Uint8Array(32))
 * then encodes with toUrlSafeBase64(), which produces exactly 43 chars:
 *   32 bytes: 10 groups of 3 (→ 40 chars) + 2 remaining bytes (→ 3 chars) = 43 chars
 *   No '=' padding in URL-safe base64.
 */
function isValidPasswordSalt(s: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(s);
}

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

/**
 * FIX #8: Derives approximate plaintext byte count server-side from the
 * ciphertext blob length. Used exclusively for PasteLog — not for the tier
 * gate (which uses the client-supplied sizeBytes for belt-and-suspenders).
 */
function approximatePlaintextBytes(encryptedBlobLength: number): number {
  return Math.max(1, Math.floor(encryptedBlobLength * 0.75) - 16);
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

  // FIX H1: Reject any request that still sends passwordProof — old clients or
  // probing attackers. There is no valid use for this field server-side anymore.
  if ('passwordProof' in raw) {
    return Response.json(
      { error: 'passwordProof is no longer accepted. Update your client.', code: 'ERR_INVALID_FIELD' },
      { status: 400 },
    );
  }

  // ── encryptedBlob ──────────────────────────────────────────────────────────
  if (typeof raw['encryptedBlob'] !== 'string' || raw['encryptedBlob'].length === 0) {
    return Response.json(
      { error: 'encryptedBlob is required', code: 'ERR_MISSING_FIELD' },
      { status: 400 },
    );
  }
  if (!isValidBase64Url(raw['encryptedBlob'] as string)) {
    return Response.json(
      { error: 'encryptedBlob must be URL-safe base64 encoded (no +, /, or = characters)', code: 'ERR_INVALID_ENCODING' },
      { status: 400 },
    );
  }

  // ── IV ─────────────────────────────────────────────────────────────────────
  if (typeof raw['iv'] !== 'string') {
    return Response.json(
      { error: 'iv is required', code: 'ERR_MISSING_FIELD' },
      { status: 400 },
    );
  }
  if (!isValidIv(raw['iv'] as string)) {
    return Response.json(
      {
        error: 'iv must be exactly 16 URL-safe base64 characters (encoding of 12 bytes for AES-GCM)',
        code:  'ERR_INVALID_IV',
      },
      { status: 400 },
    );
  }

  // ── expirySeconds ──────────────────────────────────────────────────────────
  if (typeof raw['expirySeconds'] !== 'number' || !Number.isInteger(raw['expirySeconds']) || raw['expirySeconds'] <= 0) {
    return Response.json(
      { error: 'expirySeconds must be a positive integer', code: 'ERR_INVALID_FIELD' },
      { status: 400 },
    );
  }

  if (!isValidMaxViews(raw['maxViews'])) {
    return Response.json(
      { error: 'maxViews must be an integer from 0–9999', code: 'ERR_INVALID_VIEWS' },
      { status: 400 },
    );
  }
  if (typeof raw['hasPassword'] !== 'boolean') {
    return Response.json(
      { error: 'hasPassword must be a boolean', code: 'ERR_INVALID_FIELD' },
      { status: 400 },
    );
  }
  if (typeof raw['sizeBytes'] !== 'number' || raw['sizeBytes'] <= 0) {
    return Response.json(
      { error: 'sizeBytes must be a positive number', code: 'ERR_INVALID_FIELD' },
      { status: 400 },
    );
  }
  if (!isValidLanguage(raw['language'])) {
    return Response.json(
      { error: 'language must be a string or null', code: 'ERR_INVALID_FIELD' },
      { status: 400 },
    );
  }

  // ── Password fields ────────────────────────────────────────────────────────
  if (raw['hasPassword'] === true) {
    // FIX S1: passwordSalt must be exactly 43 base64url chars (32-byte salt).
    if (typeof raw['passwordSalt'] !== 'string' || raw['passwordSalt'].length === 0) {
      return Response.json(
        { error: 'passwordSalt required when hasPassword is true', code: 'ERR_MISSING_FIELD' },
        { status: 400 },
      );
    }
    if (!isValidPasswordSalt(raw['passwordSalt'] as string)) {
      return Response.json(
        {
          error: 'passwordSalt must be exactly 43 URL-safe base64 characters (encoding of 32 bytes)',
          code:  'ERR_INVALID_FIELD',
        },
        { status: 400 },
      );
    }
  }

  const parsedBody: CreateBody = {
    encryptedBlob: raw['encryptedBlob'] as string,
    iv:            raw['iv'] as string,
    expirySeconds: raw['expirySeconds'] as number,
    maxViews:      raw['maxViews'] as number,
    hasPassword:   raw['hasPassword'] as boolean,
    passwordSalt:  typeof raw['passwordSalt'] === 'string' ? raw['passwordSalt'] : undefined,
    sizeBytes:     raw['sizeBytes'] as number,
    language:      sanitizeLanguage(raw['language'] as string | null),
  };

  // ── 2. Auth & tier ─────────────────────────────────────────────────────────
  const { userId, sessionClaims } = await auth();
  const tierInfo = deriveTierFromClaims(userId ?? null, sessionClaims as Record<string, unknown> | null);
  const { tier, planType } = tierInfo;
  const limits = getLimits(tier, planType);

  // ── 3. Rate limit ──────────────────────────────────────────────────────────
  const rawIp        = getClientIp(request);
  const ipHash       = await hashIp(rawIp);
  const rateLimiter  = getPasteRatelimiter(tier, planType);
  const rateLimitKey = getPasteRatelimitKey(tier, userId ?? null, ipHash);

  const { success: rateLimitPassed, reset, remaining, limit } = await rateLimiter.limit(rateLimitKey);
  if (!rateLimitPassed) {
    return rateLimitedResponse(reset, tier);
  }

  // ── 4. Feature gates ───────────────────────────────────────────────────────
  const upgradeUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pricing`;

  if (parsedBody.hasPassword && !limits.allowPassword) {
    return Response.json(
      { error: 'Password protection requires a Pro subscription.', code: 'ERR_TIER_REQUIRED', upgradeUrl },
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
      { error: `View count exceeds your plan maximum of ${limits.maxViews}.`, code: 'ERR_TIER_REQUIRED', upgradeUrl },
      { status: 403 },
    );
  }

  if (parsedBody.maxViews === 0 && !limits.allowUnlimitedViews) {
    return Response.json(
      { error: 'Unlimited views require an Annual Pro subscription.', code: 'ERR_TIER_REQUIRED', upgradeUrl: `${upgradeUrl}#annual` },
      { status: 403 },
    );
  }

  if (parsedBody.maxViews > 10 && !limits.allowCustomViews) {
    return Response.json(
      { error: 'Custom view counts require a Pro subscription.', code: 'ERR_TIER_REQUIRED', upgradeUrl },
      { status: 403 },
    );
  }

  // FIX #4: Strict expiry whitelist per tier.
  if (!isAllowedExpiry(parsedBody.expirySeconds, tier, planType)) {
    const allowedKey    = tier === 'anonymous' ? 'anonymous' : tier === 'free' ? 'free' : `pro:${planType ?? 'monthly'}`;
    const { ALLOWED_EXPIRY_SECONDS } = await import('../../../../lib/plan-limits');
    const allowed       = [...(ALLOWED_EXPIRY_SECONDS[allowedKey] ?? new Set())];
    return Response.json(
      {
        error:   `expirySeconds must be one of the allowed values for your plan: ${allowed.join(', ')}`,
        code:    'ERR_INVALID_EXPIRY',
        allowed,
      },
      { status: 400 },
    );
  }

  // ── Size gates ─────────────────────────────────────────────────────────────
  if (parsedBody.sizeBytes > limits.maxPlaintextBytes) {
    return Response.json(
      { error: `Paste size exceeds your plan limit of ${limits.maxPlaintextBytes} bytes.`, code: 'ERR_SIZE_EXCEEDED' },
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
  const id        = randomBytes(9).toString('base64url');
  const now       = Date.now();
  const expiresAt = now + parsedBody.expirySeconds * 1000;

  // ── 6. Write to Redis atomically ───────────────────────────────────────────
  // FIX H1: passwordProof is intentionally omitted from the record.
  // The server stores only passwordSalt (needed for client PBKDF2 derivation).
  // No password-derived value is ever stored alongside the ciphertext.
  const pasteRecord: RedisPasteRecord = {
    encryptedBlob: parsedBody.encryptedBlob,
    iv:            parsedBody.iv,
    hasPassword:   parsedBody.hasPassword,
    passwordSalt:  parsedBody.passwordSalt ?? null,
    maxViews:      parsedBody.maxViews,
    expiresAt,
    language:      parsedBody.language,
  };

  const pasteKey   = redisKeys.paste(id);
  const viewsKey   = redisKeys.views(id);
  const ttlSeconds = parsedBody.expirySeconds;

  try {
    const pipeline = redis.pipeline();
    pipeline.set(pasteKey, JSON.stringify(pasteRecord), { ex: ttlSeconds });
    pipeline.set(viewsKey, 0, { ex: ttlSeconds });
    await pipeline.exec();
  } catch (redisErr) {
    console.error('[scorchpad] create — redis pipeline.exec() failed:', redisErr);
    return Response.json(
      { error: 'Failed to store paste. Please try again.', code: 'ERR_STORAGE_FAILED' },
      { status: 503 },
    );
  }

  // ── 7. Log paste creation to Postgres (metadata only — never content) ──────
  // FIX #8: sizeBytes derived server-side from actual ciphertext blob length.
  const serverSideSizeBytes = approximatePlaintextBytes(parsedBody.encryptedBlob.length);

  db.pasteLog.create({
    data: {
      userId:    userId ?? null,
      ipHash,
      sizeBytes: serverSideSizeBytes,
    },
  }).catch((err: unknown) => {
    console.error('[scorchpad] PasteLog write failed (non-fatal):', {
      pasteId: id,
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
