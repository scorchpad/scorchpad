// lib/plan-limits.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for all tier-based feature gates and daily limits.
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
//
// NOTE — password protection:
//   Per spec A.6 feature matrix: password protection is a PRO-ONLY feature.
//   anonymous.allowPassword = false  ← correct
//   free.allowPassword      = false  ← FIXED (was incorrectly true)
//   pro:*.allowPassword     = true
//
// NOTE — maxViews ceiling semantics:
//   maxViews = 0 → unlimited (pro:annual only).
//   maxViews > 0 → hard server-side ceiling; client preset choices must be ≤ this.
//   The create route enforces: parsedBody.maxViews <= limits.maxViews (when > 0).
//
// WHY planType, NOT isPro: Monthly (50/day) ≠ Half-Yearly (150/day) ≠ Annual (500/day).
// Collapsing all Pro tiers into one bucket loses the per-plan daily caps.
// See Gotcha #16 in the build spec.
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
  /** Maximum expiry in seconds. */
  maxExpirySeconds: number;
  /**
   * Maximum view count ceiling.
   * 0  = unlimited (pro:annual only, gated by allowUnlimitedViews).
   * >0 = hard ceiling enforced server-side; create route rejects parsedBody.maxViews > this.
   */
  maxViews: number;
  /** Maximum plaintext bytes. Ciphertext in the request body will be ~1.37× this. */
  maxPlaintextBytes: number;
  /** Password-protected pastes — Pro only per spec. */
  allowPassword: boolean;
  allowExtendedExpiry: boolean;
  /** Custom view count input (any 1–9999). Pro only. Free gets fixed presets 1/5/10. */
  allowCustomViews: boolean;
  /** Unlimited views (maxViews=0). Annual Pro only. */
  allowUnlimitedViews: boolean;
  /** Plaintext > 50 KB, up to 500 KB / 1 MB. Any Pro plan. */
  allowLargePaste: boolean;
};

// ── Authoritative plan limits ─────────────────────────────────────────────────
// Every value cross-referenced against spec A.7 and the ExpirySelector option list.

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  anonymous: {
    dailyPastes:        3,
    maxExpirySeconds:   3_600,               // spec: 1 hour
    maxViews:           1,                   // spec: 1 only (burn-after-reading)
    maxPlaintextBytes:  10_240,              // spec: 10 KB
    allowPassword:         false,
    allowExtendedExpiry:   false,
    allowCustomViews:      false,
    allowUnlimitedViews:   false,
    allowLargePaste:       false,
  },
  free: {
    dailyPastes:        10,
    maxExpirySeconds:   86_400,              // spec: 24 hours
    maxViews:           10,                  // spec: up to 10 (presets: 1, 5, 10)
    maxPlaintextBytes:  51_200,              // spec: 50 KB
    allowPassword:         false,            // spec: Pro only — FIXED (was incorrectly true)
    allowExtendedExpiry:   false,
    allowCustomViews:      false,            // free gets fixed presets only
    allowUnlimitedViews:   false,
    allowLargePaste:       false,
  },
  'pro:monthly': {
    dailyPastes:        50,
    maxExpirySeconds:   7 * 24 * 3_600,     // spec: 7 days
    maxViews:           9_999,               // spec: any 1–9999
    maxPlaintextBytes:  524_288,             // spec: 500 KB
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   false,
    allowLargePaste:       true,
  },
  'pro:half-yearly': {
    dailyPastes:        150,
    maxExpirySeconds:   30 * 24 * 3_600,    // spec: 30 days
    maxViews:           9_999,
    maxPlaintextBytes:  524_288,             // spec: 500 KB
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   false,
    allowLargePaste:       true,
  },
  'pro:annual': {
    dailyPastes:        500,
    maxExpirySeconds:   90 * 24 * 3_600,    // spec: 90 days
    maxViews:           0,                   // 0 = unlimited per spec
    maxPlaintextBytes:  1_048_576,           // spec: 1 MB
    allowPassword:         true,
    allowExtendedExpiry:   true,
    allowCustomViews:      true,
    allowUnlimitedViews:   true,
    allowLargePaste:       true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the PLAN_LIMITS key for a given tier + planType combination.
 * Single place to update if key names ever change.
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

/**
 * Returns the upgrade URL for paywall responses.
 * Single place to update if the pricing page path changes.
 */
export function getUpgradeUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pricing`;
}
