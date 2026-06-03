// app/api/paste/[id]/verify-password/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/paste/[id]/verify-password
// Verifies the password proof token and returns the encrypted blob.
//
// DOUBLE ROUND-TRIP FLOW (Gotcha #9):
//   1. GET /api/paste/[id]         → returns { hasPassword: true, passwordSalt }
//   2. Client runs PBKDF2 in-browser (310,000 iterations) using password + salt
//   3. Client computes HMAC-SHA256(derivedKey, pasteId) = passwordProof
//   4. POST /api/paste/[id]/verify-password  → { passwordProof }
//   5. Server compares proofs using constant-time comparison
//   6. If match: run Lua view+burn script, return { encryptedBlob, iv, ... }
//   7. Client decrypts in-browser using the derived key — server never sees the key
//
// WHY CONSTANT-TIME COMPARISON: A timing-variable comparison leaks whether the
// proof is "close" to correct, enabling a timing oracle attack on the proof token.
// timingSafeEqual from Node crypto eliminates this.
//
// WHY LUA FOR BURN: The view decrement runs here (not on GET) for password pastes.
// Running it on GET would destroy a maxViews=1 paste before the password is entered.
// See Gotcha #11.
//
// ─── FIX (CRITICAL) ──────────────────────────────────────────────────────────
// Same root-cause fix as in GET route.ts:
//
// OLD (broken):
//   redis.eval(VIEW_AND_BURN_LUA, [pasteKey, viewsKey], [String(now)])
//   → Lua returned [pasteJson, viewsRemainingStr]
//   → Upstash auto-deserialised pasteJson string into a JS object
//   → JSON.parse(object) → "[object Object]" → SyntaxError → catch → 404
//
// NEW (correct):
//   redis.eval(VIEW_AND_BURN_LUA, [pasteKey, viewsKey],
//              [String(paste.maxViews), String(paste.expiresAt), String(now)])
//   → Lua returns only [viewsRemainingStr]
//   → Route uses already-fetched `paste` object for the HTTP response
//   → No JSON.parse needed — no Upstash deserialisation issue
// ─────────────────────────────────────────────────────────────────────────────
//
// RUNTIME: Node.js — uses timingSafeEqual from node:crypto (not available on Edge).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { timingSafeEqual } from 'node:crypto';

import { redis } from '../../../../../lib/redis';
import { getClientIp, hashIp } from '../../../../../lib/ip';
import { passwordVerifyLimit, rateLimitedResponse } from '../../../../../lib/ratelimit';
import {
  redisKeys,
  VIEW_AND_BURN_LUA,
  type LuaViewResult,
  type RedisPasteRecord,
} from '../../../../../lib/paste-types';

const NO_CACHE_HEADERS: HeadersInit = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma':        'no-cache',
  'Expires':       '0',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  // ── 1. Validate ID format ──────────────────────────────────────────────────
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) {
    return Response.json(
      { error: 'Paste not found', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 2. Parse and validate request body ────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', code: 'ERR_INVALID_BODY' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  if (!body || typeof body !== 'object') {
    return Response.json(
      { error: 'Body must be an object', code: 'ERR_INVALID_BODY' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw['passwordProof'] !== 'string' || raw['passwordProof'].length === 0) {
    return Response.json(
      { error: 'passwordProof is required', code: 'ERR_MISSING_FIELD' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }
  const submittedProof = raw['passwordProof'];

  // ── 3. Rate limit — per hashed IP + paste ID ──────────────────────────────
  // Key combines IP hash + paste ID to lock per-paste, not globally.
  // This prevents brute-forcing proof tokens on any single target paste.
  // 5 attempts per 15 minutes before lockout.
  const rawIp  = getClientIp(request);
  const ipHash = await hashIp(rawIp);
  const rateLimitKey = `${ipHash}:${id}`;

  const { success, reset } = await passwordVerifyLimit.limit(rateLimitKey);
  if (!success) {
    return rateLimitedResponse(reset);
  }

  // ── 4. Fetch paste from Redis ──────────────────────────────────────────────
  const pasteKey = redisKeys.paste(id);
  const viewsKey = redisKeys.views(id);

  let paste: RedisPasteRecord | null;
  try {
    paste = await redis.get<RedisPasteRecord>(pasteKey);
  } catch (redisErr) {
    console.error('[scorchpad] verify-password — redis.get() failed:', redisErr);
    return Response.json(
      { error: 'Service temporarily unavailable. Please try again.', code: 'ERR_SERVICE_UNAVAILABLE' },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  if (!paste) {
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 5. Confirm this paste actually requires a password ────────────────────
  if (!paste.hasPassword || !paste.passwordProof) {
    // Return 400, not 404 (don't leak state about whether the paste exists)
    return Response.json(
      { error: 'This paste is not password-protected', code: 'ERR_NOT_PASSWORD_PROTECTED' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 6. Constant-time proof comparison ─────────────────────────────────────
  // Both buffers must be the same byte length for timingSafeEqual.
  // If they differ in length, the proof is wrong — short-circuit with a constant-time
  // false by comparing against the stored proof (which IS the right length).
  const storedProofBuf    = Buffer.from(paste.passwordProof, 'utf8');
  const submittedProofBuf = Buffer.from(submittedProof,      'utf8');

  const proofMatch =
    storedProofBuf.length === submittedProofBuf.length &&
    timingSafeEqual(storedProofBuf, submittedProofBuf);

  if (!proofMatch) {
    return Response.json(
      { error: 'Incorrect password', code: 'ERR_WRONG_PASSWORD' },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 7. Correct proof — run atomic view-count + burn ───────────────────────
  // Belt-and-suspenders expiry check before running Lua.
  const now = Date.now();
  if (paste.expiresAt > 0 && paste.expiresAt < now) {
    try {
      await redis.del(pasteKey, viewsKey);
    } catch {
      // DEL failure is non-fatal — Redis TTL will clean up.
    }
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // FIX: Pass maxViews, expiresAt, now as ARGV — Lua no longer returns paste JSON.
  // The script returns only [viewsRemainingStr] or nil.
  let result: LuaViewResult;
  try {
    result = await redis.eval(
      VIEW_AND_BURN_LUA,
      [pasteKey, viewsKey],
      [String(paste.maxViews), String(paste.expiresAt), String(now)]
    ) as LuaViewResult;
  } catch (evalErr) {
    console.error('[scorchpad] verify-password — redis.eval() failed:', evalErr);
    return Response.json(
      { error: 'Service temporarily unavailable. Please try again.', code: 'ERR_SERVICE_UNAVAILABLE' },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  if (!result) {
    // Expired or burned by a concurrent verify call during this window.
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // result[0] is the views-remaining status string/number (Upstash may auto-parse).
  const viewsRemaining = Number(result[0]);

  // ── 8. Return encrypted blob for client-side decryption ───────────────────
  // FIX: Use the already-fetched `paste` object — no JSON.parse needed.
  return Response.json(
    {
      encryptedBlob:  paste.encryptedBlob,
      iv:             paste.iv,
      viewsRemaining,
      expiresAt:      paste.expiresAt,
      language:       paste.language,
    },
    { headers: NO_CACHE_HEADERS }
  );
}
