// app/api/paste/[id]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/paste/[id]
//
// CRITICAL INVARIANTS:
//   • NEVER increments view counter for password-protected pastes on GET
//     (Gotcha #11: a maxViews=1 password paste would self-destruct before
//     the user enters their password).
//   • NEVER returns encryptedBlob when hasPassword=true.
//   • Viewing counter incremented atomically via Lua (Gotcha #3).
//   • All responses carry Cache-Control: no-store, no-cache to prevent any
//     CDN or edge cache from serving a stale/burned paste or reducing the
//     effective view count.
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
  const rawIp = getClientIp(request);
  const ipHash = await hashIp(rawIp);
  const { success, reset } = await pasteReadLimit.limit(ipHash);
  if (!success) {
    return rateLimitedResponse(reset);
  }

  // ── 3. Fetch paste metadata from Redis ────────────────────────────────────
  const pasteKey = redisKeys.paste(id);
  const viewsKey = redisKeys.views(id);
  const paste = await redis.get<RedisPasteRecord>(pasteKey);

  if (!paste) {
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 4. Belt-and-suspenders expiry check (Redis TTL is primary) ────────────
  const now = Date.now();
  if (paste.expiresAt > 0 && paste.expiresAt < now) {
    await redis.del(pasteKey, viewsKey);
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // ── 5. Password-protected: return gate metadata only (no blob) ────────────
  // DO NOT run the Lua burn script here — Gotcha #11.
  if (paste.hasPassword) {
    const rawViews = await redis.get<number>(viewsKey);
    const currentViews = typeof rawViews === 'number' ? rawViews : 0;
    const viewsRemaining =
      paste.maxViews === 0 ? -1 : paste.maxViews - currentViews;

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
  const result = await redis.eval(
    VIEW_AND_BURN_LUA,
    [pasteKey, viewsKey],
    [String(now)]
  ) as LuaViewResult;

  if (!result) {
    // Lua returned nil — paste was just burned by a concurrent request or expired
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  const [resultPasteJson, viewsRemainingStr] = result;
  const viewsRemaining = Number(viewsRemainingStr);

  let resultPaste: RedisPasteRecord;
  try {
    resultPaste = JSON.parse(resultPasteJson) as RedisPasteRecord;
  } catch {
    return Response.json(
      { error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  return Response.json(
    {
      encryptedBlob:  resultPaste.encryptedBlob,
      iv:             resultPaste.iv,
      hasPassword:    false,
      viewsRemaining,
      expiresAt:      resultPaste.expiresAt,
      language:       resultPaste.language,
    },
    { headers: NO_CACHE_HEADERS }
  );
}
