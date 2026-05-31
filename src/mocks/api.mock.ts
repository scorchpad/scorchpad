// src/mocks/api.mock.ts
// ─────────────────────────────────────────────────────────────────────────────
// ALL backend integration points live here.
// Import from this file at every call site — never inline fetch() calls.
//
// Real implementations below — all mock stubs have been replaced.
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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let code = 'ERR_UNKNOWN';
    try {
      const body = await res.json() as { code?: string; error?: string };
      code = body.code ?? code;
    } catch { /* ignore parse failure */ }
    throw new ApiError(`API error ${res.status}`, code, res.status);
  }

  return res.json() as Promise<T>;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<UserSubscription> {
  return apiFetch<UserSubscription>('/api/user/subscription');
}

export async function createPaste(
  req: CreatePasteRequest
): Promise<CreatePasteResponse> {
  return apiFetch<CreatePasteResponse>('/api/paste/create', {
    method: 'POST',
    body:   JSON.stringify(req),
  });
}

export async function getPaste(
  id: string
): Promise<GetPasteResponse | null> {
  const res = await fetch(`/api/paste/${id}`);

  if (res.status === 404) return null;

  if (!res.ok) {
    let code = 'ERR_UNKNOWN';
    try {
      const body = await res.json() as { code?: string };
      code = body.code ?? code;
    } catch { /* ignore */ }
    throw new ApiError(`API error ${res.status}`, code, res.status);
  }

  return res.json() as Promise<GetPasteResponse>;
}

export async function verifyPastePassword(
  id: string,
  passwordHash: string    // HMAC-SHA256(derivedKey, pasteId) — rate-limiting proof only
): Promise<VerifyPasswordResponse | null> {
  const res = await fetch(`/api/paste/${id}/verify-password`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    // Parameter is named passwordHash at the call site; the API field is passwordProof
    body:    JSON.stringify({ passwordProof: passwordHash }),
  });

  if (res.status === 404) return null;
  if (res.status === 401) return null;  // Wrong password — caller handles null as incorrect

  if (!res.ok) {
    let code = 'ERR_UNKNOWN';
    try {
      const body = await res.json() as { code?: string };
      code = body.code ?? code;
    } catch { /* ignore */ }
    throw new ApiError(`API error ${res.status}`, code, res.status);
  }

  return res.json() as Promise<VerifyPasswordResponse>;
}

export async function checkActionAllowed(
  action: 'unlimited_views' | 'custom_views' | 'password_protection' | 'extended_expiry' | 'large_paste'
): Promise<{ allowed: boolean; reason?: string; upgradeUrl?: string }> {
  return apiFetch<{ allowed: boolean; reason?: string; upgradeUrl?: string }>(
    '/api/user/action-check',
    { method: 'POST', body: JSON.stringify({ action }) }
  );
}

export async function openCheckout(
  plan: PlanDuration
): Promise<{ checkoutUrl: string }> {
  return apiFetch<{ checkoutUrl: string }>(
    '/api/checkout',
    { method: 'POST', body: JSON.stringify({ plan }) }
  );
}

export async function pollSubscriptionStatus(): Promise<UserSubscription> {
  return apiFetch<UserSubscription>('/api/user/subscription');
}
