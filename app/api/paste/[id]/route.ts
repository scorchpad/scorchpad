// app/api/paste/[id]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/paste/[id]
// Returns encrypted paste blob (non-password) or password gate metadata (password-protected).
//
// CRITICAL INVARIANTS:
//   • This route NEVER increments the view counter for password-protected pastes.
//     Gotcha #11: A maxViews=1 password paste would self-destruct on the initial GET
//     before the user even enters their password. The Lua view+burn script runs
//     ONLY on POST /api/paste/[id]/verify-password for password-protected pastes.
//
//   • This route NEVER returns the encryptedBlob when hasPassword=true.
//     The blob is withheld until the password proof is verified server-side.
//
//   • Viewing counter is incremented atomically via Lua (Gotcha #11).
//     No two-step GET→INCR — see lib/paste-types.ts for the Lua script.
//
// RUNTIME: Edge (no Prisma, no Node.js-only imports).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'edge';

import { redis }  from '../../../../lib/redis';
import { getClientIp, hashIp } from '../../../../lib/ip';
import { pasteReadLimit, rateLimitedResponse } from '../../../../lib/ratelimit';
import {
  redisKeys,
  VIEW_AND_BURN_LUA,
  type LuaViewResult,
  type RedisPasteRecord,
} from '../../../../lib/paste-types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  // ── 1. Validate ID format ──────────────────────────────────────────────────
  // 12 URL-safe base64 chars (randomBytes(9).toString('base64url'))
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) {
    return Response.json({ error: 'Paste not found', code: 'ERR_NOT_FOUND' }, { status: 404 });
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

  // Upstash auto-parses JSON on get() — use the typed form directly, no manual JSON.parse.
  const paste = await redis.get<RedisPasteRecord>(pasteKey);
  if (!paste) {
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  // ── 4. Belt-and-suspenders expiry check ───────────────────────────────────
  const now = Date.now();
  if (paste.expiresAt > 0 && paste.expiresAt < now) {
    // Clean up stale keys (Redis TTL should handle this, but be explicit)
    await redis.del(pasteKey, viewsKey);
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  // ── 5. Password-protected paste: return gate metadata only ────────────────
  // NEVER run the Lua burn script here — see Gotcha #11.
  // The encryptedBlob is withheld until verify-password succeeds.
  if (paste.hasPassword) {
    const rawViews = await redis.get<number>(viewsKey);
    const currentViews = typeof rawViews === 'number' ? rawViews : 0;
    const viewsRemaining = paste.maxViews === 0
      ? -1
      : paste.maxViews - currentViews;

    // GetPasteResponse shape (password gate): omit encryptedBlob and iv
    return Response.json({
      hasPassword:    true,
      passwordSalt:   paste.passwordSalt,
      viewsRemaining,
      expiresAt:      paste.expiresAt,
      language:       paste.language,
    });
  }

  // ── 6. Non-password paste: atomic view increment + conditional burn ────────
  // The Lua script handles the full read+increment+delete cycle atomically.
  const result = await redis.eval(
    VIEW_AND_BURN_LUA,
    [pasteKey, viewsKey],
    [String(now)]
  ) as LuaViewResult;

  if (!result) {
    // Lua returned nil — paste expired or was just burned by a concurrent request
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  const [resultPasteJson, viewsRemainingStr] = result;
  const viewsRemaining = Number(viewsRemainingStr);

  // Lua returns the raw JSON string from Redis GET — parse it here.
  let resultPaste: RedisPasteRecord;
  try {
    resultPaste = JSON.parse(resultPasteJson) as RedisPasteRecord;
  } catch {
    return Response.json({ error: 'Paste not found or expired', code: 'ERR_NOT_FOUND' }, { status: 404 });
  }

  // GetPasteResponse shape from api.mock.ts:
  // { encryptedBlob?, iv?, passwordSalt?, viewsRemaining, expiresAt, hasPassword, language }
  return Response.json({
    encryptedBlob:  resultPaste.encryptedBlob,
    iv:             resultPaste.iv,
    hasPassword:    false,
    viewsRemaining,
    expiresAt:      resultPaste.expiresAt,
    language:       resultPaste.language,
  });
}
