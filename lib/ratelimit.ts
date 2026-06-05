// lib/ratelimit.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rate limiters for ScorchPad API routes.
//
// WHY SLIDING WINDOW: Unlike fixed windows, sliding windows don't allow
// bursting at window boundaries (e.g. 10 req in the last second of window 1
// + 10 in the first second of window 2 = 20 req/s despite a 10/window limit).
//
// KEY DESIGN:
// - All limiters share the `rl:pv:` prefix namespace, isolating ScorchPad
//   from any other service sharing this Upstash instance.
// - Paste creation limiter bucket is chosen per planType, not just isPro.
//   Monthly Pro (50/day) ≠ Annual Pro (unlimited). See Gotcha #16.
// - Rate limit keys are keyed by hashed IP (anon) or userId (authenticated).
//   Raw IPs never appear in any Redis key — see lib/ip.ts.
//
// SECURITY FIXES (this version):
//   FIX #5: Added subscriptionLimit and actionCheckLimit.
//
//   FIX #6: Added healthLimit.
//
//   FIX M1 — cspReportLimit (NEW):
//     /api/csp-report was completely unrated. An attacker flooding it with
//     valid-looking violation reports consumed a serverless slot per request
//     with zero cost to the attacker (no auth, no compute). At scale this
//     exhausts the Vercel function concurrency limit, denying real requests.
//     60 req/min per IP is generous for genuine browser CSP reporting (which
//     fires on actual violations, not in tight loops) while blocking floods.
//
//   FIX M2 — webhookLimit (NEW):
//     Both webhook endpoints (/api/webhooks/lemonsqueezy and /api/webhooks/razorpay)
//     were completely unrated. Flooding them forces repeated HMAC-SHA256 body
//     verification + DB idempotency queries per request. 200 req/min per IP
//     is well above any legitimate provider delivery frequency (providers
//     typically retry at most every few seconds), but stops brute-force replay
//     attacks and serverless slot exhaustion.
//
//   FIX L1 — checkoutLimit (NEW):
//     /api/checkout was unrated. A tight loop creates Razorpay subscriptions
//     (paid API calls) or LemonSqueezy checkout sessions, burning provider
//     quota and potentially triggering fraud flags. 10 req/min per userId
//     is more than enough for any real user flow (one click → one checkout URL).
//
//   FIX NEW-2 — accountDeleteLimit (NEW):
//     DELETE /api/user/account was unrated. It calls the payment provider
//     cancellation API (Razorpay or LS) before deleting the Postgres row.
//     Flooding it could burst the payment provider's API rate limit, causing
//     legitimate cancellations elsewhere to fail. 5/min per userId ensures the
//     delete flow can retry on transient error without enabling abuse.
//
// ALL RATE LIMIT RESPONSES must return 429 with Retry-After header.
// ─────────────────────────────────────────────────────────────────────────────

import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

// ── Paste creation limits ─────────────────────────────────────────────────────

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
 * prevents abuse while being effectively unlimited for real use.
 */
export const proAnnualPasteLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '24 h'),
  prefix: 'rl:pv:pro:paste:annual',
});

// ── Read / view limits ────────────────────────────────────────────────────────

/** Paste read limit: 20 per minute per hashed IP. Applies to GET /api/paste/[id]. */
export const pasteReadLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:pv:read',
});

// ── Password verification limits ──────────────────────────────────────────────

/**
 * Per-IP + per-paste rate limit: 5 per 15 minutes.
 * Keys must be `${ipHash}:${pasteId}` — per-paste, not global.
 *
 * LAYER 1 of password brute-force protection. LAYER 2 is the global per-paste
 * attempt counter (pv:pwattempts:{id}) — see verify-password/route.ts.
 */
export const passwordVerifyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:pv:pwverify',
});

// ── User subscription endpoint limit ─────────────────────────────────────────

/**
 * /api/user/subscription: 60 requests per minute.
 * Key: userId for authenticated callers, ipHash for anonymous.
 */
export const subscriptionLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:pv:subscription',
});

// ── User action-check endpoint limit ─────────────────────────────────────────

/**
 * /api/user/action-check: 30 requests per minute.
 * Key: userId for authenticated callers, ipHash for anonymous.
 */
export const actionCheckLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:pv:actioncheck',
});

// ── Health endpoint limit ─────────────────────────────────────────────────────

/**
 * /api/health: 30 requests per minute per IP.
 */
export const healthLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:pv:health',
});

// ── CSP report limit ─────────────────────────────────────────────────────────
// FIX M1: /api/csp-report was completely unrated → serverless slot exhaustion.
// 60/min per IP is generous for genuine browser CSP reports (which fire only
// on real violations) while blocking automated floods.

/**
 * /api/csp-report: 60 requests per minute per hashed IP.
 */
export const cspReportLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:pv:cspreport',
});

// ── Webhook limit ─────────────────────────────────────────────────────────────
// FIX M2: Both webhook endpoints were completely unrated → forced repeated
// HMAC verification + DB queries. 200/min per IP is well above legitimate
// provider delivery frequency while stopping replay/flood attacks.

/**
 * /api/webhooks/*: 200 requests per minute per IP.
 * Shared by both LemonSqueezy and Razorpay webhook endpoints.
 */
export const webhookLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, '1 m'),
  prefix: 'rl:pv:webhook',
});

// ── Checkout limit ────────────────────────────────────────────────────────────
// FIX L1: /api/checkout was unrated → could burn provider API quota by creating
// subscriptions/checkout sessions in tight loops. 10/min per userId allows
// normal retry behaviour without enabling abuse.

/**
 * /api/checkout: 10 requests per minute per userId.
 */
export const checkoutLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'rl:pv:checkout',
});

// ── Account delete limit ──────────────────────────────────────────────────────
// FIX NEW-2: DELETE /api/user/account was unrated → could burst payment provider
// cancellation APIs. 5/min per userId allows transient-error retries without
// enabling abuse of the provider API.

/**
 * DELETE /api/user/account: 5 requests per minute per userId.
 */
export const accountDeleteLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'rl:pv:accountdelete',
});

// ── General API limits ────────────────────────────────────────────────────────

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
 */
export function getPasteRatelimiter(
  tier: 'anonymous' | 'free' | 'pro',
  planType: string | null,
): Ratelimit {
  if (tier === 'anonymous') return anonymousPasteLimit;
  if (tier === 'free')      return freePasteLimit;
  if (planType === 'annual')      return proAnnualPasteLimit;
  if (planType === 'half-yearly') return proHalfYrPasteLimit;
  return proMonthlyPasteLimit;
}

/**
 * Builds the rate limit identifier for paste creation.
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
 */
export function rateLimitedResponse(
  reset: number,
  tier: 'anonymous' | 'free' | 'pro' = 'anonymous',
): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

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
        error:    'Daily paste limit reached.',
        code:     'ERR_RATE_LIMITED',
        hint:     'Sign up for a free account to get 10 pastes per day.',
        signUpUrl: '/sign-up',
      };
      break;
    case 'free':
      body = {
        error:      'Daily paste limit reached.',
        code:       'ERR_RATE_LIMITED',
        hint:       'Upgrade to ScorchPad Pro for up to 50 pastes per day.',
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
      'Retry-After':   String(retryAfterSeconds),
      'Cache-Control': 'no-store',
    },
  });
}
