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
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The full paste record stored in Redis under `pv:paste:{id}`.
 * PRIVACY: The decryption key is NEVER part of this record — it lives only
 * in the URL fragment (#key=...) on the client side and never reaches the server.
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
 * Return type of the atomic view-count Lua script.
 * The script returns a two-element array [pasteJson, viewsRemainingStr].
 * viewsRemainingStr: '-1' = unlimited, '0' = last view (paste deleted), 'N' = N remaining.
 */
export type LuaViewResult = [string, string] | null;

/**
 * Inline Lua script for atomic view increment + conditional burn.
 *
 * WHY LUA: This operation must be atomic. A two-step GET → INCR → conditional DEL
 * in application code has a TOCTOU race: two concurrent requests could both read
 * viewCount=0, both increment to 1, and neither triggers the burn on a maxViews=1
 * paste. With Lua, Redis executes the entire script as a single atomic command.
 * See Gotcha #11.
 *
 * KEYS[1] = "pv:paste:{id}"
 * KEYS[2] = "pv:views:{id}"
 * ARGV[1] = current Unix timestamp in milliseconds (as string)
 *
 * Returns:
 *   nil              → paste not found or expired (return 404)
 *   {json, '-1'}     → unlimited views, return paste
 *   {json, '0'}      → last view, paste has been burned, return paste
 *   {json, 'N'}      → N views remaining, return paste
 */
export const VIEW_AND_BURN_LUA = `
local pasteJson = redis.call('GET', KEYS[1])
if not pasteJson then
  return nil
end

local data = cjson.decode(pasteJson)
local now = tonumber(ARGV[1])

-- Belt-and-suspenders expiry check on top of Redis TTL.
if data.expiresAt and data.expiresAt > 0 and data.expiresAt < now then
  redis.call('DEL', KEYS[1], KEYS[2])
  return nil
end

-- Unlimited views: no counter needed, never burn.
if data.maxViews == 0 then
  return {pasteJson, '-1'}
end

-- Atomically increment the view counter.
-- pv:views:{id} is initialised to 0 at paste creation with the same TTL.
-- INCR on a non-existent key would start from 1, but we always initialise.
local viewCount = redis.call('INCR', KEYS[2])
local remaining = data.maxViews - viewCount

if remaining <= 0 then
  -- This is the final view. Burn both keys but return the paste for this last look.
  redis.call('DEL', KEYS[1], KEYS[2])
  return {pasteJson, '0'}
else
  return {pasteJson, tostring(remaining)}
end
`;

/** Namespaced Redis key helpers — never construct raw strings in route handlers. */
export const redisKeys = {
  paste:   (id: string) => `pv:paste:${id}` as const,
  views:   (id: string) => `pv:views:${id}` as const,
} as const;
