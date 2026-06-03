// lib/paste-types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Internal types for the backend paste system.
// These are NOT exposed to the client — they describe what lives in Redis.
// Frontend-visible shapes live in src/types/index.ts.
//
// Redis key layout (all keys documented here as the single source of truth):
//   pv:paste:{id}   → JSON-encoded RedisPasteRecord        TTL: expirySeconds
//   pv:views:{id}   → integer view counter (starts at 0)   TTL: expirySeconds
//   rl:pv:*         → rate limiter sliding windows          TTL: window duration
//
// ─── FIX (CRITICAL) ──────────────────────────────────────────────────────────
// VIEW_AND_BURN_LUA has been redesigned to NOT return the paste JSON.
//
// ROOT CAUSE OF THE BUG:
//   The old Lua script returned the raw paste JSON string as element 0 of its
//   result array:  { pasteJson, viewsRemainingStr }.
//
//   Upstash's @upstash/redis REST client auto-deserialises ALL values in every
//   response — including individual elements of arrays returned by EVAL.  The
//   paste record is stored as a valid JSON string, so Upstash parsed it from a
//   string  '{"encryptedBlob":"…","iv":"…",…}'  into a plain JavaScript object
//   {encryptedBlob: "…", iv: "…", …}  before the route handler ever saw it.
//
//   The route handler then called:
//       JSON.parse(resultPasteJson)           // resultPasteJson is already an object
//   JavaScript coerces the object to the string "[object Object]" before passing
//   it to JSON.parse(), producing a SyntaxError.  The catch block returned 404.
//
//   Result: the user's paste was read (and for maxViews=1 also permanently
//   burned by the Lua DEL) but the route returned 404 — "paste not found" — on
//   every single view.
//
// FIX:
//   The new Lua script receives maxViews, expiresAt, and now as ARGV parameters
//   from the caller (which already holds the paste record from a prior
//   redis.get() call).  The script no longer returns the paste JSON — it returns
//   only the views-remaining status code.  The caller uses the already-fetched
//   paste object for the HTTP response, bypassing Upstash deserialization entirely.
//
//   Advantages of the new design:
//     • No cjson.decode() — simpler, faster, portable across Redis versions.
//     • No JSON returned from Lua — Upstash has nothing to misparse.
//     • Lua script is smaller and its purpose is clearer.
//     • Atomic EXISTS + INCR + conditional DEL still guarantees no race condition.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The full paste record stored in Redis under `pv:paste:{id}`.
 * PRIVACY: The decryption key is NEVER part of this record — it lives only
 * in the URL fragment (#key=…) on the client side and never reaches the server.
 */
export type RedisPasteRecord = {
  /** AES-GCM ciphertext, URL-safe Base64 encoded. */
  encryptedBlob: string;

  /** AES-GCM IV, URL-safe Base64 encoded. 12 bytes → 16 chars. */
  iv: string;

  /** Whether a password is required to retrieve the encrypted blob. */
  hasPassword: boolean;

  /**
   * PBKDF2 salt used by the client to derive the decryption key from the password.
   * The server stores this ONLY to return it to the client so PBKDF2 can run in-browser.
   * The server never uses this salt for decryption — it cannot decrypt.
   * Null for non-password pastes.
   */
  passwordSalt: string | null;

  /**
   * HMAC-SHA256(derivedKey, pasteId) — a proof token that the client holds the
   * correct password. Used ONLY for rate-limiting verify-password attempts.
   * The server cannot decrypt with this — it is not the decryption key.
   * Null for non-password pastes.
   */
  passwordProof: string | null;

  /** 0 = unlimited views. 1–9999 = max allowed views. */
  maxViews: number;

  /**
   * Unix timestamp in milliseconds when this paste expires.
   * 0 = no expiry (belt-and-suspenders — Redis TTL also handles expiry).
   */
  expiresAt: number;

  /** Syntax highlight language hint. Null for plain text. */
  language: string | null;
};

/**
 * Return type of the atomic view-count Lua script (VIEW_AND_BURN_LUA).
 *
 * The script returns a single-element array whose element is the views-remaining
 * status string, or null (Lua nil) when the paste was not found / already expired.
 *
 * NOTE: Upstash auto-deserialises string-shaped Redis values — the single
 * element arrives as a number in practice (e.g. 0, -1, 5).  Callers use
 * Number(result[0]) to normalise.
 *
 *  null         → paste not found or expired (return 404)
 *  ['-1'] / [-1]  → unlimited views (maxViews=0)
 *  ['0']  / [0]   → last view — paste has been burned; return content for this view
 *  ['N']  / [N]   → N views remaining; paste still alive
 */
export type LuaViewResult = [string | number] | null;

/**
 * Atomic view-increment + conditional burn Lua script.
 *
 * WHY LUA (not application-level INCR + conditional DEL):
 *   Without atomicity, two concurrent requests can both read viewCount = 0,
 *   both increment to 1, and neither triggers the burn on a maxViews=1 paste.
 *   Both serve the content.  With Lua, Redis executes the entire script as a
 *   single indivisible command — no interleaving possible.  See Gotcha #3 and
 *   Gotcha #11 in the build spec.
 *
 * WHY NO JSON RETURN (key difference from v1):
 *   The old script returned the full paste JSON as element 0 of its result.
 *   Upstash's REST client auto-deserialises that string into a JS object.
 *   The route handler then called JSON.parse(object) which coerced the object
 *   to "[object Object]" and threw SyntaxError → catch → 404 on every view.
 *   See the ROOT CAUSE note at the top of this file.
 *
 *   Fix: the caller pre-fetches the paste with redis.get<RedisPasteRecord>()
 *   BEFORE calling this script and uses that already-parsed object for the
 *   HTTP response.  The script only needs to confirm the paste still exists,
 *   handle the view counter atomically, and return a simple status string.
 *
 * KEYS[1] = "pv:paste:{id}"       — paste record
 * KEYS[2] = "pv:views:{id}"       — view counter (integer string, starts at '0')
 * ARGV[1] = maxViews               — string: '0' = unlimited, '1'-'9999' = exact limit
 * ARGV[2] = expiresAt              — string: Unix timestamp ms; '0' = no explicit expiry
 * ARGV[3] = now                    — string: current Unix timestamp ms
 *
 * Returns:
 *   nil      → paste not found or expired (both keys deleted if expiry triggered)
 *   {'-1'}   → unlimited views (maxViews=0); paste untouched
 *   {'0'}    → this was the last view; paste is now permanently burned
 *   {'N'}    → N views remain after this view; paste still alive
 */
export const VIEW_AND_BURN_LUA = `
local maxViews  = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])

-- Verify paste still exists.
-- It may have been deleted by a concurrent Lua execution or by Redis TTL
-- expiry between the caller's redis.get() call and this Lua execution.
if redis.call('EXISTS', KEYS[1]) == 0 then
  return nil
end

-- Belt-and-suspenders expiry check on top of Redis TTL.
-- Redis TTL is the primary mechanism; this catches any clock-skew edge cases.
if expiresAt and expiresAt > 0 and now > expiresAt then
  redis.call('DEL', KEYS[1], KEYS[2])
  return nil
end

-- Unlimited views (maxViews == 0): no counter needed, never burn.
if maxViews == 0 then
  return {'-1'}
end

-- Atomically increment view counter.
-- pv:views:{id} was initialised to 0 at paste creation with the same TTL.
-- INCR on a missing key (rare TTL-skew edge case) safely starts from 1.
local viewCount = redis.call('INCR', KEYS[2])
local remaining = maxViews - viewCount

if remaining <= 0 then
  -- This is the final view.  Burn both keys but signal success so the
  -- caller can serve the paste content for this last, terminal look.
  redis.call('DEL', KEYS[1], KEYS[2])
  return {'0'}
end

return {tostring(remaining)}
`;

/** Namespaced Redis key helpers — never construct raw strings in route handlers. */
export const redisKeys = {
  paste:   (id: string) => `pv:paste:${id}` as const,
  views:   (id: string) => `pv:views:${id}` as const,
} as const;
