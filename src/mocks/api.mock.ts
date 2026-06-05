// src/mocks/api.mock.ts
// ─────────────────────────────────────────────────────────────────────────────
// ALL backend integration points live here.
// Import from this file at every call site — never inline fetch() calls.
//
// SECURITY FIX (H1 — passwordProof removed):
//   CreatePasteRequest.passwordProof field has been removed entirely.
//   The server rejects any request that still sends this field with
//   ERR_INVALID_FIELD (see create/route.ts).
//
//   verifyPastePassword() no longer accepts or sends a passwordHash argument.
//   OLD: verifyPastePassword(id, passwordHash) → POST { passwordProof: hash }
//   NEW: verifyPastePassword(id)               → POST {}
//   The server no longer does proof comparison — it returns the blob to any
//   caller within the global attempt limit. Wrong password detection is now
//   purely client-side via AES-GCM auth-tag failure in decryptTextWithPassword().
//
//   verifyPastePassword() null return changed:
//   OLD: null meant 404 OR 401 (wrong password — old server gate)
//   NEW: null means 404 only (paste not found / expired)
//   There is no longer a 401 from the verify-password endpoint.
//
// CHANGELOG (prior version):
//   FIX: apiFetch() was throwing ApiError with message "API error {status}",
//   discarding the server's human-readable body.error entirely.
//
//   FIX: ApiError now carries retryAfter, upgradeUrl, signUpUrl so callers
//   can render contextual retry timers and upgrade CTAs.
//
//   ADDED: CreatePasteResponse.rateLimitRemaining / rateLimitReset for
//   immediate UI counter update after paste creation.
// ─────────────────────────────────────────────────────────────────────────────

export type UserTier = 'anonymous' | 'free' | 'pro';

export type PlanDuration = 'monthly' | 'half-yearly' | 'annual';

export interface UserSubscription {
  tier: UserTier;
  planDuration: PlanDuration | null;
  pastesCreatedToday: number;
  pastesRemainingToday: number;
  dailyLimit: number;
  maxExpiry: number;
  maxViews: number;
  currentPeriodEnd: string | null;
}

export interface CreatePasteRequest {
  encryptedBlob: string;
  iv: string;
  expirySeconds: number;
  maxViews: number;
  hasPassword: boolean;
  passwordSalt?: string;
  // FIX H1: passwordProof field REMOVED.
  // The server no longer accepts, stores, or verifies this field.
  // Any request still including it receives ERR_INVALID_FIELD (400).
  sizeBytes: number;
  language: string | null;
}

export interface CreatePasteResponse {
  id: string;
  /**
   * Remaining paste slots in the current 24-hour window, AFTER this paste.
   * Optional — handle undefined gracefully (older deployments may not send it).
   */
  rateLimitRemaining?: number;
  /** Unix timestamp (ms) when the current rate-limit window resets. Optional. */
  rateLimitReset?: number;
}

export interface GetPasteResponse {
  encryptedBlob?: string;
  iv?: string;
  passwordSalt?: string;
  viewsRemaining: number;
  expiresAt: number;
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
    credentials: 'same-origin',
  });

  if (!res.ok) {
    let code    = 'ERR_UNKNOWN';
    let message = `Request failed (${res.status})`;
    let retryAfter: number | undefined;
    let upgradeUrl: string | undefined;
    let signUpUrl:  string | undefined;

    if (res.status === 429) {
      const ra = res.headers.get('Retry-After');
      if (ra !== null) {
        const parsed = parseInt(ra, 10);
        if (!isNaN(parsed) && parsed > 0) retryAfter = parsed;
      }
    }

    try {
      const body = await res.json() as {
        code?: string;
        error?: string;
        upgradeUrl?: string;
        signUpUrl?: string;
      };
      if (typeof body.error      === 'string' && body.error.length      > 0) message    = body.error;
      if (typeof body.code       === 'string' && body.code.length       > 0) code        = body.code;
      if (typeof body.upgradeUrl === 'string' && body.upgradeUrl.length > 0) upgradeUrl  = body.upgradeUrl;
      if (typeof body.signUpUrl  === 'string' && body.signUpUrl.length  > 0) signUpUrl   = body.signUpUrl;
    } catch { /* Body was not JSON — use defaults */ }

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
    let code    = 'ERR_UNKNOWN';
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
 * Fetches the encrypted blob for a password-protected paste.
 *
 * Returns null if the paste is not found or expired (404).
 * Throws ApiError for rate limit (429 ERR_PASTE_LOCKED), server errors, etc.
 *
 * SECURITY FIX (H1): No passwordHash/proof argument — the server no longer
 * performs server-side proof comparison. The blob is returned to any caller
 * within the global attempt limit. Wrong-password detection is exclusively
 * client-side: AES-GCM decryption with the wrong key throws a DOMException
 * ("OperationError"), which PasswordPrompt catches and maps to "Incorrect password."
 *
 * Note: There is no longer a 401 response from this endpoint. The null return
 * value now only indicates 404 (paste not found / expired).
 */
export async function verifyPastePassword(
  id: string,
): Promise<VerifyPasswordResponse | null> {
  const res = await fetch(`/api/paste/${id}/verify-password`, {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body:        JSON.stringify({}),
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    let code    = 'ERR_UNKNOWN';
    let message = `Request failed (${res.status})`;
    let retryAfter: number | undefined;
    try {
      if (res.status === 429) {
        const ra = res.headers.get('Retry-After');
        if (ra !== null) {
          const parsed = parseInt(ra, 10);
          if (!isNaN(parsed) && parsed > 0) retryAfter = parsed;
        }
      }
      const body = await res.json() as { code?: string; error?: string };
      if (typeof body.error === 'string') message = body.error;
      if (typeof body.code  === 'string') code    = body.code;
    } catch { /* ignore */ }
    throw new ApiError(message, code, res.status, retryAfter);
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
  region: 'india' | 'intl',
): Promise<{ checkoutUrl: string }> {
  return apiFetch<{ checkoutUrl: string }>(
    '/api/checkout',
    { method: 'POST', body: JSON.stringify({ plan, region }) },
  );
}

export async function pollSubscriptionStatus(): Promise<UserSubscription> {
  return apiFetch<UserSubscription>('/api/user/subscription');
}
