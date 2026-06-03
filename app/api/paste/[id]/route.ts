// app/api/paste/[id]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/paste/[id]
//
// CRITICAL INVARIANTS:
//   • NEVER increments view counter for password-protected pastes on GET
//     (Gotcha #11: a maxViews=1 password paste would self-destruct before
//     the user enters their password).
//   • NEVER returns encryptedBlob when hasPassword=true.
//   • View counter incremented atomically via Lua (Gotcha #3).
//   • All responses carry Cache-Control: no-store to prevent any CDN or edge
//     cache from serving a stale/burned paste or reducing the view count.
//
// ─── FIX (CRITICAL) ──────────────────────────────────────────────────────────
// The Lua call now passes pre-fetched paste properties as ARGV instead of
// expecting the script to re-read and return the paste JSON.
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
//   → Route uses the already-fetched `paste` object for the HTTP response
//   → No JSON.parse needed — no Upstash deserialisation issue
//
// The pre-fetched `paste` object is safe to use for the response because:
//   1. Pastes are immutable — content never changes after creation.
//   2. If the paste was deleted between redis.get() and the Lua EVAL
//      (concurrent burn or TTL expiry), the Lua EXISTS check returns nil
//      and we return 404.  We never serve content from a deleted paste.
// ─────────────────────────────────────────────────────────────────────────────
//
// RUNTIME: Edge (no Prisma, no Node.js-only imports).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'edge';

import { redis } from '../../../../lib/redis';
import { getClientIp, hashIp } from '../../../../lib/ip';
import { pasteReadLimit, rateLimitedResponse } from '../../../../lib/ratelimit';
import {
  redisKeys,
  VIEW_AND_BURN_LUA,
  type LuaViewResult,
  type RedisPasteRecord,
} from '../../../../lib/paste-types';

// Applied to every response — prevents CDN caching from reducing view counts
// or serving stale content after a paste is burned.
const NO_CACHE_HEADERS: HeadersInit = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma':        'no-cache',
  'Expires':       '0',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  // ── 1. Validate ID format ──────────────────────────────────────────────────
  // 12 URL-safe base64url chars = randomBytes(9).toString('base64url')
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) {
    return Response.json(
      { error: 'Paste not found', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 2. Rate limit — per hashed IP ─────────────────────────────────────────
  const rawIp  = getClientIp(request);
  const ipHash = await hashIp(rawIp);
  const { success, reset } = await pasteReadLimit.limit(ipHash);
  if (!success) {
    return rateLimitedResponse(reset);
  }

  const pasteKey = redisKeys.paste(id);
  const viewsKey = redisKeys.views(id);

  // ── 3. Fetch paste record from Redis ──────────────────────────────────────
  // redis.get<T>() auto-deserialises the stored JSON string into a typed object.
  // We use this pre-fetched object for the HTTP response (see FIX note above).
  let paste: RedisPasteRecord | null;
  try {
    paste = await redis.get<RedisPasteRecord>(pasteKey);
  } catch (redisErr) {
    console.error('[scorchpad] GET paste — redis.get() failed:', redisErr);
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

  // ── 4. Belt-and-suspenders expiry check (Redis TTL is primary) ────────────
  const now = Date.now();
  if (paste.expiresAt > 0 && paste.expiresAt < now) {
    // Expired — clean up proactively (Redis TTL would catch this too, but
    // explicit cleanup avoids wasting storage until the TTL fires).
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

  // ── 5. Password-protected: return gate metadata only (no blob) ────────────
  // DO NOT run the Lua burn script here — Gotcha #11.
  // The view counter runs on POST /api/paste/[id]/verify-password, not here.
  if (paste.hasPassword) {
    let currentViews = 0;
    try {
      const rawViews = await redis.get<number>(viewsKey);
      currentViews = typeof rawViews === 'number' ? rawViews : 0;
    } catch {
      // Redis failure reading the counter is non-fatal — default to 0.
    }

    const viewsRemaining = paste.maxViews === 0 ? -1 : paste.maxViews - currentViews;

    return Response.json(
      {
        hasPassword:    true,
        passwordSalt:   paste.passwordSalt,
        viewsRemaining,
        expiresAt:      paste.expiresAt,
        language:       paste.language,
      },
      { headers: NO_CACHE_HEADERS }
    );
  }

  // ── 6. Non-password: atomic view increment + conditional burn ──────────────
  //
  // FIX: Pass maxViews, expiresAt, and now as ARGV so the Lua script does NOT
  // need to re-read or return the paste JSON.  This avoids Upstash's
  // auto-deserialisation of the returned string (which caused JSON.parse to
  // receive a JS object, coerce it to "[object Object]", throw SyntaxError,
  // and return 404 on every first view).
  //
  // The script returns only [viewsRemainingStr] or nil.
  // We use the already-fetched `paste` object for the HTTP response body.
  let result: LuaViewResult;
  try {
    result = await redis.eval(
      VIEW_AND_BURN_LUA,
      [pasteKey, viewsKey],
      [String(paste.maxViews), String(paste.expiresAt), String(now)]
    ) as LuaViewResult;
  } catch (evalErr) {
    console.error('[scorchpad] GET paste — redis.eval() failed:', evalErr);
    return Response.json(
      { error: 'Service temporarily unavailable. Please try again.', code: 'ERR_SERVICE_UNAVAILABLE' },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  if (!result) {
    // Lua returned nil — paste was expired or burned by a concurrent request
    // between our redis.get() and the EVAL execution.
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // result[0] is the views-remaining status.
  // Upstash may deserialise the Lua string '-1'/'0'/'N' to a number; Number()
  // normalises either form correctly.
  const viewsRemaining = Number(result[0]);

  // ── 7. Return encrypted blob for client-side decryption ───────────────────
  // Use the pre-fetched `paste` object — correct, safe, and no JSON.parse needed.
  return Response.json(
    {
      encryptedBlob:  paste.encryptedBlob,
      iv:             paste.iv,
      hasPassword:    false,
      viewsRemaining,
      expiresAt:      paste.expiresAt,
      language:       paste.language,
    },
    { headers: NO_CACHE_HEADERS }
  );
}
