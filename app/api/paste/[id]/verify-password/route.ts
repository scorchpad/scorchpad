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
// RUNTIME: Node.js — uses timingSafeEqual from node:crypto (not available in Edge).
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  // ── 1. Validate ID format ──────────────────────────────────────────────────
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) {
    return Response.json({ error: 'Paste not found', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  // ── 2. Parse and validate request body ────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body', code: 'ERR_INVALID_BODY' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Body must be an object', code: 'ERR_INVALID_BODY' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  // The frontend mock function is verifyPastePassword(id, passwordHash).
  // The POST body field is { passwordProof: string }.
  // passwordProof = HMAC-SHA256(derivedKey, pasteId) — rate-limiting token only.
  if (typeof raw['passwordProof'] !== 'string' || raw['passwordProof'].length === 0) {
    return Response.json(
      { error: 'passwordProof is required', code: 'ERR_MISSING_FIELD' },
      { status: 400 }
    );
  }
  const submittedProof = raw['passwordProof'];

  // ── 3. Rate limit — per hashed IP + paste ID ──────────────────────────────
  // Key combines IP hash + paste ID to lock per-paste, not globally.
  // This prevents brute-forcing proof tokens on any single target paste.
  // 5 attempts per 15 minutes before lockout.
  const rawIp = getClientIp(request);
  const ipHash = await hashIp(rawIp);
  const rateLimitKey = `${ipHash}:${id}`;

  const { success, reset } = await passwordVerifyLimit.limit(rateLimitKey);
  if (!success) {
    return rateLimitedResponse(reset);
  }

  // ── 4. Fetch paste from Redis ──────────────────────────────────────────────
  const pasteKey = redisKeys.paste(id);
  // Upstash auto-parses JSON on get() — use the typed form directly.
  const paste = await redis.get<RedisPasteRecord>(pasteKey);

  if (!paste) {
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  // ── 5. Confirm this paste actually requires a password ────────────────────
  if (!paste.hasPassword || !paste.passwordProof) {
    // Caller is wrong about the paste type — return 400, not 404 (don't leak state)
    return Response.json(
      { error: 'This paste is not password-protected', code: 'ERR_NOT_PASSWORD_PROTECTED' },
      { status: 400 }
    );
  }

  // ── 6. Constant-time proof comparison ─────────────────────────────────────
  // Both buffers must be the same byte length for timingSafeEqual.
  // If they differ in length, proof is wrong — short-circuit with a constant-time
  // false by comparing against the stored proof (which IS the right length).
  const storedProofBuf   = Buffer.from(paste.passwordProof, 'utf8');
  const submittedProofBuf = Buffer.from(submittedProof, 'utf8');

  const proofMatch =
    storedProofBuf.length === submittedProofBuf.length &&
    timingSafeEqual(storedProofBuf, submittedProofBuf);

  if (!proofMatch) {
    // Return 401, not 403 — the proof was wrong, not forbidden
    return Response.json(
      { error: 'Incorrect password', code: 'ERR_WRONG_PASSWORD' },
      { status: 401 }
    );
  }

  // ── 7. Correct proof — run the atomic view + burn Lua script ──────────────
  // This is where the view counter is decremented for password-protected pastes.
  // Running it here (not on GET) is the fix for Gotcha #11.
  const viewsKey = redisKeys.views(id);
  const now = Date.now();

  // Belt-and-suspenders expiry check before running Lua
  if (paste.expiresAt > 0 && paste.expiresAt < now) {
    await redis.del(pasteKey, viewsKey);
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  const result = await redis.eval(
    VIEW_AND_BURN_LUA,
    [pasteKey, viewsKey],
    [String(now)]
  ) as LuaViewResult;

  if (!result) {
    // Expired or burned by a concurrent verify call during this window
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  const [resultPasteJson, viewsRemainingStr] = result;
  const viewsRemaining = Number(viewsRemainingStr);

  let resultPaste: RedisPasteRecord;
  try {
    resultPaste = JSON.parse(resultPasteJson) as RedisPasteRecord;
  } catch {
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  // ── 8. Return the encrypted blob ───────────────────────────────────────────
  // VerifyPasswordResponse shape from api.mock.ts:
  // { encryptedBlob: string, iv: string, viewsRemaining: number, expiresAt: number, language: string | null }
  return Response.json({
    encryptedBlob:  resultPaste.encryptedBlob,
    iv:             resultPaste.iv,
    viewsRemaining,
    expiresAt:      resultPaste.expiresAt,
    language:       resultPaste.language,
  });
}
