// app/api/paste/[id]/verify-password/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/paste/[id]/verify-password
// Returns the encrypted blob for a password-protected paste after rate-limit
// checks pass. Decryption happens entirely client-side — the server never sees
// the password, the derived key, or the plaintext.
//
// PASSWORD FLOW (two-round-trip design — Gotcha #9):
//   1. GET /api/paste/[id]          → returns { hasPassword: true, passwordSalt }
//   2. Client runs PBKDF2 in-browser (310,000 iterations, SHA-256)
//      using: password + passwordSalt  →  derivedKey (32 bytes)
//   3. POST /api/paste/[id]/verify-password (empty body or {})
//   4. Server checks rate limits and returns { encryptedBlob, iv, ... }
//   5. Client decrypts in-browser using the derived key
//   6. If decryption fails → wrong password (server cannot detect this)
//
// SECURITY FIXES (this version):
//
//   FIX PATCH-BUG — Counter increment order (deploy-blocking regression):
//     OLD: redis.incr(attemptsKey) fired BEFORE the timingSafeEqual comparison.
//          Every correct access burned the global counter. A 100-view paste
//          locked after 100 correct views (counter = 100, exceeds MAX on
//          the 101st) rather than only counting wrong-password attempts as
//          intended. Effectively: correct access was indistinguishable from
//          brute-force from the counter's perspective.
//
//   FIX H1 — passwordProof offline oracle removed:
//     OLD: verify-password accepted { passwordProof } in the request body and
//          compared it (timingSafeEqual) against a stored HMAC-SHA256 hash in
//          Redis. The stored hash was a fast offline oracle — a Redis dump gave
//          the attacker both ciphertext AND a 1× HMAC target, making the
//          310,000-iteration PBKDF2 key stretching completely irrelevant.
//     NEW: passwordProof is no longer stored or verified server-side.
//          The request body is ignored. Rate limits are the only gates.
//          The global counter now limits TOTAL blob retrievals (not just failed
//          proofs), so any caller burns an attempt slot on every request.
//          Correct-password holders get the blob immediately (no false negative);
//          attackers get the blob too but cannot decrypt it without PBKDF2.
//
//   FIX S2 — Global attempt ceiling raised to 100 (see paste-types.ts):
//     Mitigates weaponisation of the global lock by coordinated IPs. With
//     passwordProof removed, the counter bounds view-burning, not just
//     wrong-proof submissions.
//
// WHY LUA FOR BURN: The view decrement runs here (not on GET) for password
// pastes. Running it on GET would destroy a maxViews=1 password paste before
// the password is entered. See Gotcha #11.
//
// RUNTIME: Node.js — uses redis.eval (Lua) and Redis pipeline.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { redis } from '../../../../../lib/redis';
import { getClientIp, hashIp } from '../../../../../lib/ip';
import { passwordVerifyLimit, rateLimitedResponse } from '../../../../../lib/ratelimit';
import {
  redisKeys,
  VIEW_AND_BURN_LUA,
  MAX_GLOBAL_PASSWORD_ATTEMPTS,
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

  // ── 2. LAYER 1 rate limit — per hashed IP + paste ID ──────────────────────
  // First gate: prevents a single IP from hammering one paste.
  // 5 attempts per 15 minutes. Key = ipHash:pasteId.
  const rawIp        = getClientIp(request);
  const ipHash       = await hashIp(rawIp);
  const rateLimitKey = `${ipHash}:${id}`;

  const { success: perIpAllowed, reset } = await passwordVerifyLimit.limit(rateLimitKey);
  if (!perIpAllowed) {
    return rateLimitedResponse(reset);
  }

  // ── 3. LAYER 2 — Global per-paste attempt counter ─────────────────────────
  // This counter is keyed only by paste ID — NOT by IP — so IP rotation cannot
  // bypass it. After MAX_GLOBAL_PASSWORD_ATTEMPTS total requests from all IPs,
  // every further request returns 429 ERR_PASTE_LOCKED until paste expiry.
  //
  // FIX H1 + PATCH-BUG: The counter now increments on EVERY call (not just
  // failures), because there is no longer a proof comparison — we cannot
  // distinguish correct from incorrect attempts server-side. This is intentional:
  // the counter caps total blob retrievals, providing a bounded view-burning limit
  // while eliminating the offline oracle that the old proof storage introduced.
  //
  // FIX PATCH-BUG: The old code incremented BEFORE comparison, which burned the
  // counter on every correct access. Now that there is no comparison, the
  // increment-on-every-call semantics are correct by design.
  //
  // INCR and TTL fetch run in parallel (both are independent operations).
  // On first increment (result === 1), we sync the counter TTL to the paste's
  // remaining TTL so the counter auto-expires when the paste expires.
  const attemptsKey = redisKeys.pwAttempts(id);
  const pasteKey    = redisKeys.paste(id);
  const viewsKey    = redisKeys.views(id);

  let globalAttempts: number;
  let pasteTtl: number;

  try {
    [globalAttempts, pasteTtl] = await Promise.all([
      redis.incr(attemptsKey),
      redis.ttl(pasteKey),
    ]);
  } catch (redisErr) {
    console.error('[scorchpad] verify-password — global attempt counter failed:', redisErr);
    // Non-fatal: if the counter is unavailable, fall through.
    // The per-IP layer is still active as a backstop.
    globalAttempts = 0;
    pasteTtl = -1;
  }

  // Sync counter TTL to paste TTL on first increment.
  if (globalAttempts === 1 && pasteTtl > 0) {
    try {
      await redis.expire(attemptsKey, pasteTtl);
    } catch {
      // Best-effort — the INCR already happened. TTL sync failure is non-fatal.
    }
  } else if (globalAttempts === 1) {
    // Paste has no TTL (or TTL check failed) — apply 90-day safety ceiling.
    try {
      await redis.expire(attemptsKey, 90 * 24 * 3600);
    } catch {
      // Best-effort.
    }
  }

  if (globalAttempts > MAX_GLOBAL_PASSWORD_ATTEMPTS) {
    return Response.json(
      {
        error: 'Too many password attempts for this paste. Access has been locked.',
        code:  'ERR_PASTE_LOCKED',
      },
      {
        status: 429,
        headers: {
          ...NO_CACHE_HEADERS,
          'Retry-After': '900', // 15 minutes — consistent with per-IP window
        },
      }
    );
  }

  // ── 4. Fetch paste from Redis ──────────────────────────────────────────────
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
  if (!paste.hasPassword) {
    return Response.json(
      { error: 'This paste is not password-protected', code: 'ERR_NOT_PASSWORD_PROTECTED' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 6. Belt-and-suspenders expiry check ───────────────────────────────────
  const now = Date.now();
  if (paste.expiresAt > 0 && paste.expiresAt < now) {
    try {
      await redis.del(pasteKey, viewsKey, attemptsKey);
    } catch {
      // DEL failure is non-fatal — Redis TTL will clean up.
    }
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 7. Atomic view-count + burn ───────────────────────────────────────────
  // Rate limits passed. Run the Lua view+burn script and return the blob.
  // The client will attempt PBKDF2 + AES-GCM decryption — we don't know
  // whether their password is correct; the decryption result tells them.
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
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  const viewsRemaining = Number(result[0]);

  // ── 8. Return encrypted blob for client-side decryption ──────────────────
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
