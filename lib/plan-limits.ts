// lib/plan-limits.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for all tier-based feature gates and daily limits.
//
// WHY planType, NOT isPro: Monthly (50/day) ≠ Half-Yearly (150/day) ≠ Annual (500/day).
// Collapsing all Pro tiers into one bucket loses the per-plan daily caps.
// See Gotcha #16 in the build spec.
//
// SIZE CEILING: Vercel serverless payload cap is 4.5 MB. The spec states
// a 1.4 MB body limit — sized for a 1 MB Annual Pro paste plus ~33% base64
// overhead (Gotcha #6). maxPlaintextBytes for all Pro tiers is 1_000_000.
// allowLargePaste gates Free (500 KB) vs Pro (1 MB).
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
  dailyPastes:       number;
  /** Maximum expiry in seconds. */
  maxExpirySeconds:  number;
  /** Maximum view count. 0 = unlimited. */
  maxViews:          number;
  /** Maximum plaintext bytes. Ciphertext in the request body will be ~1.37× this. */
  maxPlaintextBytes: number;
  allowPassword:         boolean;
  allowExtendedExpiry:   boolean;
  allowCustomViews:      boolean;
  allowUnlimitedViews:   boolean;
  /** Large paste = plaintext > 500 KB, up to 1 MB. Requires any Pro plan. */
  allowLargePaste:       boolean;
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  anonymous: {
    dailyPastes:        3,
    maxExpirySeconds:   7  * 24 * 3600,   // 7 days
    maxViews:           10,
    maxPlaintextBytes:  100_000,            // 100 KB
    allowPassword:         false,
    allowExtendedExpiry:   false,
    allowCustomViews:      false,
    allowUnlimitedViews:   false,
    allowLargePaste:       false,
  },
  free: {
    dailyPastes:        10,
    maxExpirySeconds:   30 * 24 * 3600,   // 30 days
    maxViews:           50,
    maxPlaintextBytes:  500_000,            // 500 KB
    allowPassword:         true,
    allowExtendedExpiry:   false,
    allowCustomViews:      false,
    allowUnlimitedViews:   false,
    allowLargePaste:       false,
  },
  'pro:monthly': {
    dailyPastes:        50,
    maxExpirySeconds:   90 * 24 * 3600,   // 90 days
    maxViews:           100,
    maxPlaintextBytes:  1_000_000,          // 1 MB
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   false,
    allowLargePaste:       true,
  },
  'pro:half-yearly': {
    dailyPastes:        150,
    maxExpirySeconds:   180 * 24 * 3600,  // 180 days
    maxViews:           500,
    maxPlaintextBytes:  1_000_000,
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   false,
    allowLargePaste:       true,
  },
  'pro:annual': {
    dailyPastes:        500,
    maxExpirySeconds:   365 * 24 * 3600,  // 365 days
    maxViews:           0,                  // 0 = unlimited
    maxPlaintextBytes:  1_000_000,          // 1 MB — Vercel payload cap is 4.5 MB
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   true,
    allowLargePaste:       true,
  },
};

/**
 * Returns the PLAN_LIMITS key for a given tier + planType combination.
 * One place to update if key names ever change.
 */
export function getLimitsKey(tier: UserTier, planType: PlanType | null): string {
  if (tier === 'anonymous') return 'anonymous';
  if (tier === 'free')      return 'free';
  if (planType === 'annual')       return 'pro:annual';
  if (planType === 'half-yearly')  return 'pro:half-yearly';
  return 'pro:monthly';
}

/**
 * Returns the PlanLimits for the given tier and plan.
 * Falls back to 'anonymous' limits defensively if the key is somehow missing.
 */
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
 * Configure at: Clerk Dashboard → Sessions → Edit JWT Template.
 *
 * Uses Record<string, unknown> (not any) — all field access is narrowed
 * explicitly before use.
 */
export function deriveTierFromClaims(
  userId:        string | null,
  sessionClaims: Record<string, unknown> | null
): TierInfo {
  if (!userId) {
    return { tier: 'anonymous', planType: null, currentPeriodEnd: null };
  }

  // publicMetadata is at sessionClaims.metadata (set by the Clerk JWT template).
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
    rawPlan === 'annual'      ? 'annual'
    : rawPlan === 'half-yearly' ? 'half-yearly'
    : 'monthly';

  const currentPeriodEnd =
    typeof meta['currentPeriodEnd'] === 'string' ? meta['currentPeriodEnd'] : null;

  return { tier: 'pro', planType, currentPeriodEnd };
}

/**
 * Returns the upgrade URL for paywall responses.
 * Single place to update if the pricing page path changes.
 */
export function getUpgradeUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pricing`;
}
