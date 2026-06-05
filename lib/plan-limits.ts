// lib/plan-limits.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for all tier-based feature gates, daily limits,
// and ALLOWED expiry windows.
//
// SECURITY FIX (#4): expirySeconds now enforced via strict per-tier whitelist.
// The old code used only a max-value check, allowing arbitrary values like
// 83,000 s for a free user (should be exactly 86,400 or lower presets only).
// ALLOWED_EXPIRY_SECONDS is the canonical list; create/route.ts validates
// against this set before accepting a request.
//
// VALUES ARE AUTHORITATIVE — SPEC A.7 (SCORCHPAD_MASTER_BUILD_PROMPT_v3.md)
// ─────────────────────────────────────────────────────────────────────────────
// | Tier           | maxExpirySeconds       | maxPlaintextBytes | maxViews |
// |----------------|------------------------|-------------------|----------|
// | anonymous      | 3 600  (1 h)           | 10 240  (10 KB)   | 1        |
// | free           | 86 400  (24 h)         | 51 200  (50 KB)   | 10       |
// | pro:monthly    | 604 800  (7 d)         | 524 288  (500 KB) | 9 999    |
// | pro:half-yr    | 2 592 000  (30 d)      | 524 288  (500 KB) | 9 999    |
// | pro:annual     | 7 776 000  (90 d)      | 1 048 576  (1 MB) | 0 (∞)    |
// ─────────────────────────────────────────────────────────────────────────────

export type UserTier  = 'anonymous' | 'free' | 'pro';
export type PlanType  = 'monthly' | 'half-yearly' | 'annual';

export type TierInfo = {
  tier:             UserTier;
  planType:         PlanType | null;
  /** currentPeriodEnd as ISO string, or null if no active subscription. */
  currentPeriodEnd: string | null;
};

export type PlanLimits = {
  dailyPastes: number;
  /** Maximum expiry in seconds — used only as a fast-fail before whitelist check. */
  maxExpirySeconds: number;
  /**
   * Maximum view count ceiling.
   * 0  = unlimited (pro:annual only, gated by allowUnlimitedViews).
   * >0 = hard ceiling enforced server-side.
   */
  maxViews: number;
  /** Maximum plaintext bytes. Ciphertext in the request body will be ~1.37× this. */
  maxPlaintextBytes: number;
  /** Password-protected pastes — Pro only per spec. */
  allowPassword: boolean;
  allowExtendedExpiry: boolean;
  /** Custom view count input (any 1–9999). Pro only. */
  allowCustomViews: boolean;
  /** Unlimited views (maxViews=0). Annual Pro only. */
  allowUnlimitedViews: boolean;
  /** Plaintext > 50 KB. Any Pro plan. */
  allowLargePaste: boolean;
};

// ── Strict expiry whitelists ──────────────────────────────────────────────────
// SECURITY FIX (#4): Only these exact values are accepted in POST /api/paste/create.
// Any value not present in this set for the caller's tier → 400 ERR_INVALID_EXPIRY.
// Using a Set for O(1) lookup.

export const ALLOWED_EXPIRY_SECONDS: Record<string, ReadonlySet<number>> = {
  anonymous:       new Set([300, 3_600]),
  free:            new Set([300, 3_600, 86_400]),
  'pro:monthly':   new Set([300, 3_600, 86_400, 604_800]),
  'pro:half-yearly': new Set([300, 3_600, 86_400, 604_800, 2_592_000]),
  'pro:annual':    new Set([300, 3_600, 86_400, 604_800, 2_592_000, 7_776_000]),
} as const;

/**
 * Returns true if the given expirySeconds value is in the allowed set for
 * the caller's tier + planType.  Called in POST /api/paste/create.
 */
export function isAllowedExpiry(
  expirySeconds: number,
  tier:          UserTier,
  planType:      PlanType | null,
): boolean {
  const key     = getLimitsKey(tier, planType);
  const allowed = ALLOWED_EXPIRY_SECONDS[key];
  return allowed?.has(expirySeconds) ?? false;
}

// ── Authoritative plan limits ─────────────────────────────────────────────────

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  anonymous: {
    dailyPastes:        3,
    maxExpirySeconds:   3_600,
    maxViews:           1,
    maxPlaintextBytes:  10_240,
    allowPassword:         false,
    allowExtendedExpiry:   false,
    allowCustomViews:      false,
    allowUnlimitedViews:   false,
    allowLargePaste:       false,
  },
  free: {
    dailyPastes:        10,
    maxExpirySeconds:   86_400,
    maxViews:           10,
    maxPlaintextBytes:  51_200,
    allowPassword:         false,
    allowExtendedExpiry:   false,
    allowCustomViews:      false,
    allowUnlimitedViews:   false,
    allowLargePaste:       false,
  },
  'pro:monthly': {
    dailyPastes:        50,
    maxExpirySeconds:   7 * 24 * 3_600,
    maxViews:           9_999,
    maxPlaintextBytes:  524_288,
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   false,
    allowLargePaste:       true,
  },
  'pro:half-yearly': {
    dailyPastes:        150,
    maxExpirySeconds:   30 * 24 * 3_600,
    maxViews:           9_999,
    maxPlaintextBytes:  524_288,
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   false,
    allowLargePaste:       true,
  },
  'pro:annual': {
    dailyPastes:        500,
    maxExpirySeconds:   90 * 24 * 3_600,
    maxViews:           0,
    maxPlaintextBytes:  1_048_576,
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   true,
    allowLargePaste:       true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getLimitsKey(tier: UserTier, planType: PlanType | null): string {
  if (tier === 'anonymous') return 'anonymous';
  if (tier === 'free')      return 'free';
  if (planType === 'annual')       return 'pro:annual';
  if (planType === 'half-yearly')  return 'pro:half-yearly';
  return 'pro:monthly';
}

export function getLimits(tier: UserTier, planType: PlanType | null): PlanLimits {
  const key = getLimitsKey(tier, planType);
  return PLAN_LIMITS[key] ?? (PLAN_LIMITS['anonymous'] as PlanLimits);
}

/**
 * Derives the user's tier and plan from Clerk JWT session claims.
 * Zero DB calls — used in route handlers for rate limiting and feature gating.
 *
 * Requires the Clerk JWT template to include publicMetadata:
 *   { "metadata": "{{user.public_metadata}}" }
 */
export function deriveTierFromClaims(
  userId:        string | null,
  sessionClaims: Record<string, unknown> | null
): TierInfo {
  if (!userId) {
    return { tier: 'anonymous', planType: null, currentPeriodEnd: null };
  }

  const rawMeta = sessionClaims?.['metadata'];
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    return { tier: 'free', planType: null, currentPeriodEnd: null };
  }

  const meta = rawMeta as Record<string, unknown>;

  if (meta['isPro'] !== true) {
    return { tier: 'free', planType: null, currentPeriodEnd: null };
  }

  const rawPlan = typeof meta['planType'] === 'string' ? meta['planType'] : null;
  const planType: PlanType =
    rawPlan === 'annual'        ? 'annual'
    : rawPlan === 'half-yearly' ? 'half-yearly'
    : 'monthly';

  const currentPeriodEnd =
    typeof meta['currentPeriodEnd'] === 'string' ? meta['currentPeriodEnd'] : null;

  return { tier: 'pro', planType, currentPeriodEnd };
}

export function getUpgradeUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pricing`;
}
