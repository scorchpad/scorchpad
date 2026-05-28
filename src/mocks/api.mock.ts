// src/mocks/api.mock.ts
// ─────────────────────────────────────────────────────────────────────────────
// ALL backend integration points live here.
// Import from this file at every call site — never inline fetch() calls.
// Claude will replace this file with real implementations.
// ─────────────────────────────────────────────────────────────────────────────

export type UserTier = 'anonymous' | 'free' | 'pro';

// Plan duration type.
// 'half-yearly' is ONLY available to Indian users via Razorpay.
// Lemon Squeezy (international) supports 'monthly' and 'annual' only.
export type PlanDuration = 'monthly' | 'half-yearly' | 'annual';

export interface UserSubscription {
  tier: UserTier;
  planDuration: PlanDuration | null;   // null for anonymous/free
  pastesCreatedToday: number;
  pastesRemainingToday: number;
  dailyLimit: number;                  // 3 | 10 | 50 | 150 | -1 (unlimited)
  maxExpiry: number;                   // max allowed expirySeconds for this tier
  maxViews: number;                    // 10 for free; -1 = unlimited (Pro)
  currentPeriodEnd: string | null;     // ISO date string — Pro only
}

export interface CreatePasteRequest {
  encryptedBlob: string;       // URL-safe base64 ciphertext
  iv: string;                  // URL-safe base64 IV (16 chars = 12 bytes)
  expirySeconds: number;       // whitelist enforced server-side per tier
  maxViews: number;            // 0 = unlimited (Pro); any positive integer (Pro); 1|5|10 (Free)
  hasPassword: boolean;        // Pro only
  passwordSalt?: string;       // URL-safe base64 PBKDF2 salt — Pro only, if hasPassword=true
  passwordProof?: string;      // HMAC-SHA256(password, passwordSalt) — server-side brute-force rate limiting only; never used for decryption
  sizeBytes: number;           // size of plaintext in bytes (before encryption)
  language: string | null;     // syntax highlight language, e.g. 'typescript' | null — stored unencrypted in Redis
}

export interface CreatePasteResponse {
  id: string;                  // 10-char hex ID, e.g. "a3f8b2c1d4"
}

export interface GetPasteResponse {
  encryptedBlob?: string;      // URL-safe base64 ciphertext — omitted if hasPassword=true
  iv?: string;                 // URL-safe base64 IV — omitted if hasPassword=true
  passwordSalt?: string;       // URL-safe base64 PBKDF2 salt — present only if hasPassword=true
  viewsRemaining: number;      // -1 = unlimited; 0 = expired (should not happen, server deletes)
  expiresAt: number;           // Unix timestamp ms
  hasPassword: boolean;
  language: string | null;     // syntax highlight language, e.g. 'typescript' | null
}

export interface VerifyPasswordResponse {
  encryptedBlob: string;
  iv: string;
  viewsRemaining: number;
  expiresAt: number;
  language: string | null;
}

export async function getCurrentUser(): Promise<UserSubscription> {
  return {
    tier: 'anonymous',
    planDuration: null,
    pastesCreatedToday: 0,
    pastesRemainingToday: 3,
    dailyLimit: 3,
    maxExpiry: 3600,
    maxViews: 1,
    currentPeriodEnd: null,
  };
}

export async function createPaste(req: CreatePasteRequest): Promise<CreatePasteResponse> {
  console.log('[MOCK] createPaste called', { sizeBytes: req.sizeBytes, language: req.language });
  return { id: 'mock_abc123' };
}

export async function getPaste(id: string): Promise<GetPasteResponse | null> {
  console.log('[MOCK] getPaste called', id);
  return null;
}

export async function verifyPastePassword(
  id: string,
  passwordHash: string    // HMAC-SHA256(password, passwordSalt) — used as server-side proof only
): Promise<VerifyPasswordResponse | null> {
  console.log('[MOCK] verifyPastePassword called', id);
  return null;
}

export async function checkActionAllowed(
  action: 'unlimited_views' | 'custom_views' | 'password_protection' | 'extended_expiry' | 'large_paste'
): Promise<{ allowed: boolean; reason?: string }> {
  return { allowed: false, reason: 'Upgrade to ScorchPad Pro to unlock this feature.' };
}

export async function openCheckout(
  plan: PlanDuration
): Promise<{ checkoutUrl: string }> {
  console.log('[MOCK] openCheckout called', plan);
  return { checkoutUrl: '#mock-checkout' };
}

export async function pollSubscriptionStatus(): Promise<UserSubscription> {
  return {
    tier: 'anonymous',
    planDuration: null,
    pastesCreatedToday: 0,
    pastesRemainingToday: 3,
    dailyLimit: 3,
    maxExpiry: 3600,
    maxViews: 1,
    currentPeriodEnd: null,
  };
}
