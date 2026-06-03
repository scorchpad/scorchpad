// src/mocks/api.mock.ts
// ─────────────────────────────────────────────────────────────────────────────
// ALL backend integration points live here.
// Import from this file at every call site — never inline fetch() calls.
// Real implementations below — all mock stubs have been replaced.
//
// CHANGELOG (this version):
//   FIX: apiFetch() was throwing ApiError with message "API error {status}",
//   discarding the server's human-readable body.error entirely. Users saw
//   "API error 429" instead of "Too many requests. Please slow down."
//
//   FIX: ApiError now carries retryAfter (seconds) and upgradeUrl / signUpUrl
//   so callers can render a contextual retry timer and a sign-in/upgrade CTA
//   without any extra round-trips.
//
//   FIX: apiFetch() now reads the Retry-After response header for 429s and
//   attaches it to the thrown ApiError so the UI can display "Try again in
//   ~14 min" rather than leaving the user guessing.
//
//   FIX: apiFetch() now reads upgradeUrl / signUpUrl from the error body so
//   403 feature-gate responses can surface a direct "Upgrade to Pro →" link.
//
//   ADDED: CreatePasteResponse.rateLimitRemaining / rateLimitReset — optional
//   fields added to the success shape. The create route now returns them.
//   usePasteCreator uses them to update the Zustand store's pastesRemainingToday
//   immediately after a successful paste, so the UI shows "2 pastes left today"
//   without waiting for the next useSubscription() poll.
// ─────────────────────────────────────────────────────────────────────────────

export type UserTier = 'anonymous' | 'free' | 'pro';

// Plan duration type.
// 'half-yearly' is available to ALL users:
//   - Indian users  → Razorpay  (₹599/6mo)
//   - International → Lemon Squeezy ($12/6mo)
export type PlanDuration = 'monthly' | 'half-yearly' | 'annual';

export interface UserSubscription {
  tier: UserTier;
  planDuration: PlanDuration | null;   // null for anonymous/free
  pastesCreatedToday: number;
  pastesRemainingToday: number;
  dailyLimit: number;                  // 3 | 10 | 50 | 150 | 500
  maxExpiry: number;                   // max allowed expirySeconds for this tier
  maxViews: number;                    // 0 = unlimited (Annual Pro)
  currentPeriodEnd: string | null;     // ISO date string — Pro only
}

export interface CreatePasteRequest {
  encryptedBlob: string;       // URL-safe base64 ciphertext
  iv: string;                  // URL-safe base64 IV (16 chars = 12 bytes)
  expirySeconds: number;       // whitelist enforced server-side per tier
  maxViews: number;            // 0 = unlimited (Annual Pro); 1–9999
  hasPassword: boolean;
  passwordSalt?: string;       // URL-safe base64 PBKDF2 salt — if hasPassword=true
  passwordProof?: string;      // HMAC-SHA256(derivedKey, pasteId) — rate limiting only, never decryption
  sizeBytes: number;           // plaintext size in bytes (before encryption)
  language: string | null;     // syntax highlight language | null
}

export interface CreatePasteResponse {
  id: string;
  /**
   * Remaining paste slots in the current 24-hour window, AFTER this paste was
   * counted. Provided by the server so the UI can update immediately without
   * waiting for the next useSubscription() poll.
   *
   * Optional: may be absent from older deployments. UI must handle undefined
   * gracefully (no update to the store's pastesRemainingToday in that case).
   */
  rateLimitRemaining?: number;
  /**
   * Unix timestamp (ms) when the current rate-limit window fully resets.
   * Useful for computing "next available slot" in the UI.
   * Optional — handle undefined gracefully.
   */
  rateLimitReset?: number;
}

export interface GetPasteResponse {
  encryptedBlob?: string;      // omitted if hasPassword=true
  iv?: string;                 // omitted if hasPassword=true
  passwordSalt?: string;       // present only if hasPassword=true
  viewsRemaining: number;      // -1 = unlimited; 0 = last view (paste burned)
  expiresAt: number;           // Unix timestamp ms
  hasPassword: boolean;
  language: string | null;
}

export interface VerifyPasswordResponse {
  encryptedBlob: string;
  iv: string;
  viewsRemaining: number;
  expiresAt: number;
  language: string | null;
}

// ── Error class ───────────────────────────────────────────────────────────────

/**
 * Typed error thrown by every apiFetch() failure.
 *
 * Fields:
 *   message    — human-readable text from the server's `body.error` field.
 *                Previously this was "API error {status}" — now it is the
 *                server's actual message, e.g. "Too many requests. Please slow down."
 *   code       — machine-readable error code from `body.code` (e.g. 'ERR_RATE_LIMITED')
 *   status     — HTTP status code
 *   retryAfter — seconds until the rate-limit window resets (only for 429).
 *                Read from the Retry-After response header.
 *   upgradeUrl — URL to the pricing/upgrade page (403 tier-gate responses).
 *                Read from body.upgradeUrl.
 *   signUpUrl  — URL to the sign-up page (429 anonymous tier responses).
 *                Read from body.signUpUrl.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfter?: number,
    public readonly upgradeUrl?: string,
    public readonly signUpUrl?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Internal fetch wrapper ────────────────────────────────────────────────────

/**
 * Wraps fetch() for all API calls.
 *
 * On success: returns the parsed JSON body typed as T.
 * On failure: throws ApiError with the server's human-readable message,
 *             Retry-After (if 429), and upgrade/sign-up URLs (if 403/429).
 *
 * WHY NOT INLINE fetch(): Centralising error parsing here means every
 * call site gets the same error contract, and fixes to error handling only
 * need to happen in one place. This is the only place in the codebase that
 * may call Response.json() on an error body.
 */
async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    // Clerk session cookie must travel with API calls. fetch() includes
    // same-origin cookies by default ('same-origin' is the default credentials
    // value), so this is already correct — documented here for clarity.
    credentials: 'same-origin',
  });

  if (!res.ok) {
    // ── Defaults before we try to parse the response body ──────────────────
    let code = 'ERR_UNKNOWN';
    // Use a sensible fallback message instead of the opaque "API error {status}".
    // This is overwritten below if body.error is present.
    let message = `Request failed (${res.status})`;
    let retryAfter: number | undefined;
    let upgradeUrl: string | undefined;
    let signUpUrl: string | undefined;

    // ── Read Retry-After header for 429 responses ───────────────────────────
    // The header is set by rateLimitedResponse() in lib/ratelimit.ts.
    // It is the number of seconds until the sliding window resets.
    // Example: Retry-After: 52550  →  retryAfter = 52550 (~14.6 hours)
    if (res.status === 429) {
      const ra = res.headers.get('Retry-After');
      if (ra !== null) {
        const parsed = parseInt(ra, 10);
        if (!isNaN(parsed) && parsed > 0) {
          retryAfter = parsed;
        }
      }
    }

    // ── Parse JSON body for error details ───────────────────────────────────
    // We try/catch so a non-JSON body (e.g. plain-text 500 from Vercel) does
    // not shadow the original error with a confusing "Unexpected token" message.
    try {
      const body = await res.json() as {
        code?: string;
        error?: string;
        upgradeUrl?: string;
        signUpUrl?: string;
      };
      // Use the server's human-readable message as the thrown error's message.
      // This is the key fix: previously we used "API error {status}" regardless.
      if (typeof body.error === 'string' && body.error.length > 0) {
        message = body.error;
      }
      if (typeof body.code === 'string' && body.code.length > 0) {
        code = body.code;
      }
      // 403 feature-gate responses include upgradeUrl (set by the create route).
      if (typeof body.upgradeUrl === 'string' && body.upgradeUrl.length > 0) {
        upgradeUrl = body.upgradeUrl;
      }
      // 429 anonymous-tier responses include signUpUrl (set by rateLimitedResponse).
      if (typeof body.signUpUrl === 'string' && body.signUpUrl.length > 0) {
        signUpUrl = body.signUpUrl;
      }
    } catch {
      // Body was not JSON — use the defaults set above.
    }

    throw new ApiError(message, code, res.status, retryAfter, upgradeUrl, signUpUrl);
  }

  return res.json() as Promise<T>;
}

// ── Public API functions ──────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<UserSubscription> {
  return apiFetch<UserSubscription>('/api/user/subscription');
}

export async function createPaste(
  req: CreatePasteRequest,
): Promise<CreatePasteResponse> {
  return apiFetch<CreatePasteResponse>('/api/paste/create', {
    method: 'POST',
    body:   JSON.stringify(req),
  });
}

/**
 * Returns null if the paste is not found or has expired (404).
 * Throws ApiError for all other non-2xx responses.
 */
export async function getPaste(
  id: string,
  signal?: AbortSignal,
): Promise<GetPasteResponse | null> {
  const res = await fetch(`/api/paste/${id}`, {
    credentials: 'same-origin',
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let code = 'ERR_UNKNOWN';
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json() as { code?: string; error?: string };
      if (typeof body.error === 'string') message = body.error;
      if (typeof body.code  === 'string') code    = body.code;
    } catch { /* ignore */ }
    throw new ApiError(message, code, res.status);
  }
  return res.json() as Promise<GetPasteResponse>;
}

/**
 * Returns null if the paste is not found (404) or the password is wrong (401).
 * Callers treat null as "incorrect password — try again".
 * Throws ApiError for all other non-2xx responses.
 */
export async function verifyPastePassword(
  id: string,
  passwordHash: string, // HMAC-SHA256(derivedKey, pasteId) — rate-limiting proof only
): Promise<VerifyPasswordResponse | null> {
  const res = await fetch(`/api/paste/${id}/verify-password`, {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    // Parameter is named passwordHash at the call site; the API field is passwordProof
    body: JSON.stringify({ passwordProof: passwordHash }),
  });
  if (res.status === 404) return null;
  if (res.status === 401) return null; // Wrong password — caller shows "Incorrect password."
  if (!res.ok) {
    let code = 'ERR_UNKNOWN';
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json() as { code?: string; error?: string };
      if (typeof body.error === 'string') message = body.error;
      if (typeof body.code  === 'string') code    = body.code;
    } catch { /* ignore */ }
    throw new ApiError(message, code, res.status);
  }
  return res.json() as Promise<VerifyPasswordResponse>;
}

export async function checkActionAllowed(
  action: 'unlimited_views' | 'custom_views' | 'password_protection' | 'extended_expiry' | 'large_paste',
): Promise<{ allowed: boolean; reason?: string; upgradeUrl?: string }> {
  return apiFetch<{ allowed: boolean; reason?: string; upgradeUrl?: string }>(
    '/api/user/action-check',
    { method: 'POST', body: JSON.stringify({ action }) },
  );
}

export async function openCheckout(
  plan: PlanDuration,
): Promise<{ checkoutUrl: string }> {
  return apiFetch<{ checkoutUrl: string }>(
    '/api/checkout',
    { method: 'POST', body: JSON.stringify({ plan }) },
  );
}

export async function pollSubscriptionStatus(): Promise<UserSubscription> {
  return apiFetch<UserSubscription>('/api/user/subscription');
}
