// lib/paste-types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Internal types for the backend paste system.
// These are NOT exposed to the client — they describe what lives in Redis.
//
// Redis key layout (all keys documented here as the single source of truth):
//   pv:paste:{id}        → JSON-encoded RedisPasteRecord        TTL: expirySeconds
//   pv:views:{id}        → integer view counter (starts at 0)   TTL: expirySeconds
//   pv:pwattempts:{id}   → integer global password attempt counter TTL: expirySeconds
//   rl:pv:*              → rate limiter sliding windows          TTL: window duration
//
// SECURITY FIX (#7): Added pv:pwattempts:{id} — a global, per-paste password
// attempt counter that is NOT keyed by IP. The per-IP limit (5/15 min) is
// trivially bypassed via IP rotation; the global counter caps total attempts
// across all IPs at MAX_GLOBAL_PASSWORD_ATTEMPTS before locking the paste.
//
// SECURITY FIX (H1 — passwordProof offline oracle):
//   passwordProof has been REMOVED from RedisPasteRecord.
//
//   The old design stored passwordProof = HMAC-SHA256(password, passwordSalt)
//   alongside the ciphertext. The intent was a cheap server-side rate-limiting
//   token (online brute force gate). The side effect was a catastrophic offline
//   attack oracle: if Redis was ever dumped (Upstash breach, leaked token,
//   misconfiguration), an attacker got both the ciphertext AND a fast HMAC
//   target. A modern GPU can do ~1 billion HMAC-SHA256 ops/sec. A 6-character
//   lowercase password (~300M possibilities) cracks in under a second —
//   rendering the 310,000-iteration PBKDF2 key stretching completely worthless.
//
//   Fix: passwordProof is no longer stored. The global per-paste attempt counter
//   (pv:pwattempts:{id}) is the sole brute-force gate. This is sufficient:
//   after MAX_GLOBAL_PASSWORD_ATTEMPTS (100) total blob retrievals from all IPs,
//   the paste is locked. An attacker who gets the blob still cannot decrypt
//   without the password — PBKDF2 with 310,000 iterations is now the only path.
//
// SECURITY FIX (S2 — global attempt ceiling raised):
//   MAX_GLOBAL_PASSWORD_ATTEMPTS raised from 20 to 100.
//   At 20, only 4 IPs (each using their 5-attempt per-IP budget) were needed to
//   permanently lock a paste for every legitimate recipient. 100 raises the bar
//   significantly while still protecting short passwords from brute-force.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The full paste record stored in Redis under `pv:paste:{id}`.
 * PRIVACY: The decryption key is NEVER part of this record.
 */
export type RedisPasteRecord = {
  /** AES-GCM ciphertext, URL-safe Base64 encoded. */
  encryptedBlob: string;

  /** AES-GCM IV, URL-safe Base64 encoded. Exactly 12 bytes → 16 base64url chars. */
  iv: string;

  /** Whether a password is required to retrieve the encrypted blob. */
  hasPassword: boolean;

  /**
   * PBKDF2 salt — returned to client so it can derive the AES key in-browser.
   * The server never uses this salt for decryption. Not sensitive on its own.
   * Null for non-password pastes.
   *
   * NOTE: passwordProof has been intentionally removed (security fix H1).
   * See module-level comment. The server no longer stores any password-derived
   * value alongside the ciphertext — the global attempt counter is the sole
   * brute-force gate.
   */
  passwordSalt: string | null;

  /** 0 = unlimited views. 1–9999 = max allowed views. */
  maxViews: number;

  /** Unix timestamp in milliseconds when this paste expires. */
  expiresAt: number;

  /** Syntax highlight language hint. Null for plain text. */
  language: string | null;
};

/**
 * Return type of the atomic view-count Lua script (VIEW_AND_BURN_LUA).
 *
 * null         → paste not found or expired (return 404)
 * ['-1'] / [-1]  → unlimited views (maxViews=0)
 * ['0']  / [0]   → last view — paste has been burned; return content for this view
 * ['N']  / [N]   → N views remain after this view; paste still alive
 */
export type LuaViewResult = [string | number] | null;

/**
 * Maximum total password-blob retrievals across ALL IPs for a single paste.
 * After this many calls to verify-password, the paste returns 429 ERR_PASTE_LOCKED
 * to everyone, regardless of IP, until the paste expires.
 *
 * SECURITY FIX (S2): Raised from 20 → 100.
 * At 20, four IPs (each using the 5-attempt per-IP budget) could permanently
 * lock any paste, denying access to all legitimate recipients. 100 raises the
 * bar to 20 IPs — far harder to achieve — while still stopping a sustained
 * brute-force that rotates through large proxy pools.
 *
 * NOTE: Because passwordProof has been removed (H1 fix), every call to
 * verify-password retrieves the blob and burns a view. The counter therefore
 * limits total blob retrievals, not just failed ones. Correct-password callers
 * no longer consume this counter (only wrong-password attempts did before).
 * The counter is now the primary gate for ALL verify-password traffic.
 */
export const MAX_GLOBAL_PASSWORD_ATTEMPTS = 100;

/**
 * Atomic view-increment + conditional burn Lua script.
 *
 * KEYS[1] = "pv:paste:{id}"       — paste record
 * KEYS[2] = "pv:views:{id}"       — view counter (integer, starts at 0)
 * ARGV[1] = maxViews               — '0' = unlimited, '1'-'9999' = exact limit
 * ARGV[2] = expiresAt              — Unix timestamp ms; '0' = no explicit expiry
 * ARGV[3] = now                    — current Unix timestamp ms
 *
 * Returns:
 *   nil      → paste not found or expired
 *   {'-1'}   → unlimited views (maxViews=0)
 *   {'0'}    → this was the last view; paste is now burned
 *   {'N'}    → N views remain after this view
 */
export const VIEW_AND_BURN_LUA = `
local maxViews  = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])

if redis.call('EXISTS', KEYS[1]) == 0 then
  return nil
end

if expiresAt and expiresAt > 0 and now > expiresAt then
  redis.call('DEL', KEYS[1], KEYS[2])
  return nil
end

if maxViews == 0 then
  return {'-1'}
end

local viewCount = redis.call('INCR', KEYS[2])
local remaining = maxViews - viewCount

if remaining <= 0 then
  redis.call('DEL', KEYS[1], KEYS[2])
  return {'0'}
end

return {tostring(remaining)}
`;

/** Namespaced Redis key helpers — never construct raw strings in route handlers. */
export const redisKeys = {
  paste:      (id: string) => `pv:paste:${id}`      as const,
  views:      (id: string) => `pv:views:${id}`      as const,
  /**
   * Global password-attempt counter for a password-protected paste.
   * SECURITY FIX (#7): keyed by paste ID only — not IP — so IP rotation
   * cannot bypass the global attempt ceiling.
   * TTL is set to match the paste's remaining TTL on first INCR.
   */
  pwAttempts: (id: string) => `pv:pwattempts:${id}` as const,
} as const;
