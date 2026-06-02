// lib/ratelimit.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rate limiters for ScorchPad API routes.
//
// WHY SLIDING WINDOW: Unlike fixed windows, sliding windows don't allow
// bursting at window boundaries (e.g. 10 req in the last second of window 1
// + 10 in the first second of window 2 = 20 req/s despite a 10/window
// limit).
//
// KEY DESIGN:
// - All limiters share the `rl:pv:` prefix namespace, isolating ScorchPad
//   from any other service sharing this Upstash instance.
// - Paste creation limiter bucket is chosen per planType, not just isPro.
//   Monthly Pro (50/day) ≠ Annual Pro (unlimited). See Gotcha #16.
// - Rate limit keys are keyed by hashed IP (anon) or userId (authenticated).
//   Raw IPs never appear in any Redis key — see lib/ip.ts.
//
// CHANGELOG (this version):
//   FIX: rateLimitedResponse() now accepts an optional tier parameter and
//   returns a tier-aware body:
//     anonymous → includes signUpUrl (/sign-up) and a "sign up for 10/day" hint
//     free      → includes upgradeUrl (/pricing) and a "upgrade for 50+/day" hint
//     pro       → generic "try again" message (they just exceeded their plan cap)
//
//   The client reads signUpUrl / upgradeUrl from the error body and stores
//   them on ApiError, enabling PasteEditor to render an actionable CTA link
//   inside the error banner instead of a dead-end "API error 429" string.
//
// ALL RATE LIMIT RESPONSES must return 429 with Retry-After header.
// ─────────────────────────────────────────────────────────────────────────────

import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

// ── Paste creation limits ─────────────────────────────────────────────────────
// Keyed by: hashed IP (anonymous) or userId (authenticated).
// Daily limits per tier — see spec table B.4.

/** Anonymous: 3 pastes per 24 hours, keyed by hashed IP. */
export const anonymousPasteLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '24 h'),
  prefix: 'rl:pv:anon:paste',
});

/** Free (authenticated, no Pro subscription): 10 pastes per 24 hours. */
export const freePasteLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '24 h'),
  prefix: 'rl:pv:free:paste',
});

/** Pro Monthly: 50 pastes per 24 hours. */
export const proMonthlyPasteLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '24 h'),
  prefix: 'rl:pv:pro:paste:monthly',
});

/** Pro Half-Yearly: 150 pastes per 24 hours. */
export const proHalfYrPasteLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(150, '24 h'),
  prefix: 'rl:pv:pro:paste:halfyr',
});

/**
 * Pro Annual: 500 pastes per 24 hours.
 * NOTE: Spec says "unlimited" daily for Annual, but a safety ceiling of 500
 * prevents abuse while being effectively unlimited for real use. If genuinely
 * unlimited is required, raise this or remove the limiter from the annual branch.
 */
export const proAnnualPasteLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '24 h'),
  prefix: 'rl:pv:pro:paste:annual',
});

// ── Read / view limits ────────────────────────────────────────────────────────
// Anyone can view pastes — no auth required. Keyed by hashed IP.
// 20 reads per minute prevents scraping and automated enumeration.

/** Paste read limit: 20 per minute per hashed IP. Applies to GET /api/paste/[id]. */
export const pasteReadLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:pv:read',
});

// ── Password verification limit ───────────────────────────────────────────────
// Per paste ID per hashed IP to prevent per-paste brute forcing.
// 5 attempts per 15 minutes before lockout. The server cannot decrypt anyway
// (zero-knowledge), but this prevents credential stuffing for the proof token.

/**
 * Password verify limit: 5 per 15 minutes per hashed IP + paste ID.
 * Keys must be `${ipHash}:${pasteId}` to lock per-paste, not globally.
 */
export const passwordVerifyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:pv:pwverify',
});

// ── General API limits ────────────────────────────────────────────────────────
// Broad per-minute limits applied in middleware for all API routes not covered
// by a specific limiter above. Belt-and-suspenders against burst abuse.

/** Anonymous general API: 30 req/min. */
export const anonymousApiLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:pv:anon:api',
});

/** Free-tier general API: 60 req/min. */
export const freeApiLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:pv:free:api',
});

/** Pro-tier general API: 300 req/min. */
export const proApiLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(300, '1 m'),
  prefix: 'rl:pv:pro:api',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Selects the correct paste creation rate limiter based on the user's tier and plan.
 * Uses planType, not just isPro, because monthly/half-yr/annual have different
 * daily caps. See Gotcha #16 — isPro alone is insufficient.
 */
export function getPasteRatelimiter(
  tier: 'anonymous' | 'free' | 'pro',
  planType: string | null,
): Ratelimit {
  if (tier === 'anonymous') return anonymousPasteLimit;
  if (tier === 'free')      return freePasteLimit;
  // Pro tier — select bucket by plan duration
  if (planType === 'annual')      return proAnnualPasteLimit;
  if (planType === 'half-yearly') return proHalfYrPasteLimit;
  return proMonthlyPasteLimit; // default: Pro Monthly
}

/**
 * Builds the rate limit identifier for paste creation.
 * Anonymous: hashed IP (no userId available).
 * Authenticated: userId (stable across IP changes, correct for per-user limits).
 */
export function getPasteRatelimitKey(
  tier: 'anonymous' | 'free' | 'pro',
  userId: string | null,
  ipHash: string,
): string {
  if (tier === 'anonymous' || !userId) return ipHash;
  return userId;
}

/**
 * Returns a 429 Response with Retry-After header and a tier-aware body.
 *
 * WHY TIER-AWARE:
 *   Anonymous users hit 3/day and should be nudged to sign up (10/day).
 *   Free users hit 10/day and should be nudged to upgrade (50+/day).
 *   Pro users just exhausted their plan — tell them when the window resets.
 *
 *   The client reads signUpUrl / upgradeUrl from the body and adds them to
 *   ApiError, allowing PasteEditor to render an actionable CTA link inside
 *   the error banner. See src/mocks/api.mock.ts — apiFetch().
 *
 * BACKWARD COMPATIBILITY:
 *   The `tier` parameter is optional and defaults to 'anonymous' so existing
 *   callers (read/password-verify routes) don't need to change their call sites.
 */
export function rateLimitedResponse(
  reset: number,
  tier: 'anonymous' | 'free' | 'pro' = 'anonymous',
): Response {
  const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);

  // ── Tier-aware response body ───────────────────────────────────────────────
  type RateLimitBody = {
    error: string;
    code: string;
    hint?: string;
    signUpUrl?: string;
    upgradeUrl?: string;
  };

  let body: RateLimitBody;

  switch (tier) {
    case 'anonymous':
      body = {
        error: 'Daily paste limit reached.',
        code:  'ERR_RATE_LIMITED',
        hint:  'Sign up for a free account to get 10 pastes per day.',
        signUpUrl: '/sign-up',
      };
      break;

    case 'free':
      body = {
        error: 'Daily paste limit reached.',
        code:  'ERR_RATE_LIMITED',
        hint:  'Upgrade to ScorchPad Pro for up to 50 pastes per day.',
        upgradeUrl: '/pricing',
      };
      break;

    case 'pro':
    default:
      body = {
        error: 'Daily paste limit reached for your plan.',
        code:  'ERR_RATE_LIMITED',
      };
      break;
  }

  return Response.json(body, {
    status: 429,
    headers: {
      'Retry-After':    String(Math.max(1, retryAfterSeconds)),
      'Cache-Control':  'no-store',
    },
  });
}
