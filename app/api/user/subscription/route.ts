// app/api/user/subscription/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user/subscription
// Returns the caller's current subscription state as a UserSubscription object.
//
// Serves two frontend calls:
//   getCurrentUser()         — called on page load / editor mount
//   pollSubscriptionStatus() — polled every 3 s for up to 2 min after checkout
//
// WHY DB-AUTHORITATIVE (not JWT claims):
//   Clerk JWTs refresh every ~60 s. A user who just upgraded will have stale
//   claims for up to a minute. The frontend polls this endpoint until tier='pro'
//   appears — that only works if we read from the DB (the webhook handler's
//   write target), not from a potentially-stale JWT.
//
//   pastesCreatedToday is counted from PasteLog for the same reason.
//
// SECURITY FIXES (this version):
//
//   FIX #5 — Rate limiting added:
//     This endpoint was completely unrated. Every call drives two Postgres
//     queries in parallel (user + PasteLog count). An attacker with a valid
//     session token could exhaust the connection pool, taking down the
//     dashboard for all users.
//
//     Limit: 60 req/min per identity (userId for authenticated, ipHash for
//     anonymous). This covers the legitimate polling pattern (every 3 s for
//     up to 2 min post-checkout = ~40 requests) with headroom.
//
//   FIX #12 — PasteLog count window aligned to rate limiter:
//     OLD: todayStart = UTC midnight → pastesCreatedToday was reset daily at
//          00:00 UTC, while the rate limiter uses a 24 h SLIDING window from
//          the first paste. A user who hit the limit at 11 PM saw their
//          "remaining" count reset to the full limit at midnight, but the rate
//          limiter window hadn't moved — every API call was rejected while the
//          UI said "10 remaining".
//     NEW: pastesCreatedToday is counted from (now - 24h), exactly matching
//          the Upstash sliding window semantics. PasteLog.createdAt ≥ (now - 24h)
//          instead of ≥ UTC midnight.
//          Note: slight approximation — Upstash sliding windows use request
//          timestamps whereas PasteLog uses DB insert timestamps, but the
//          difference is sub-second and irrelevant for UX.
//
// RUNTIME: Node.js — requires Prisma.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { db }   from '../../../../lib/db';
import { getClientIp, hashIp } from '../../../../lib/ip';
import { subscriptionLimit } from '../../../../lib/ratelimit';
import {
  PLAN_LIMITS,
  getLimitsKey,
  type UserTier,
  type PlanType,
} from '../../../../lib/plan-limits';

// ── Types ─────────────────────────────────────────────────────────────────────

// Mirror of UserSubscription in src/mocks/api.mock.ts.
// Field names must be identical — a mismatch breaks wiring silently.
type UserSubscription = {
  tier:                 UserTier;
  planDuration:         PlanType | null;
  pastesCreatedToday:   number;
  pastesRemainingToday: number;
  dailyLimit:           number;
  maxExpiry:            number;   // seconds
  maxViews:             number;   // 0 = unlimited
  currentPeriodEnd:     string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isActive(status: string, periodEnd: Date | null): boolean {
  if (status !== 'active') return false;
  if (periodEnd === null)  return true;
  return periodEnd > new Date();
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();

  // ── FIX #5: Rate limiting ──────────────────────────────────────────────────
  // Identifier: userId for authenticated callers (stable, prevents per-session
  // abuse). ipHash for anonymous callers (anonymous path returns immediately
  // without hitting the DB, but still needs a limit against burst abuse).
  let rateLimitId: string;
  if (userId) {
    rateLimitId = userId;
  } else {
    const rawIp   = getClientIp(request);
    rateLimitId   = await hashIp(rawIp);
  }

  const { success, reset } = await subscriptionLimit.limit(rateLimitId);
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return Response.json(
      { error: 'Too many requests. Please slow down.', code: 'ERR_RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'Retry-After':   String(retryAfter),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // ── Anonymous — no DB query needed ──────────────────────────────────────────
  if (!userId) {
    const limits = PLAN_LIMITS['anonymous']!;
    const sub: UserSubscription = {
      tier:                 'anonymous',
      planDuration:         null,
      pastesCreatedToday:   0,
      pastesRemainingToday: limits.dailyPastes,
      dailyLimit:           limits.dailyPastes,
      maxExpiry:            limits.maxExpirySeconds,
      maxViews:             limits.maxViews,
      currentPeriodEnd:     null,
    };
    return Response.json(sub);
  }

  // ── Authenticated — query DB for fresh subscription state ──────────────────
  // FIX #12: Use a 24 h sliding window boundary instead of UTC midnight, so
  // pastesCreatedToday matches the Upstash sliding window rate limiter semantics.
  // Previously the UI showed "X remaining" after midnight while the rate limiter
  // still blocked (its 24 h window hadn't reset), causing confusing rejections.
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [dbUser, pastesCreatedToday] = await Promise.all([
    db.user.findUnique({
      where:   { clerkId: userId },
      include: { subscription: true },
    }),
    db.pasteLog.count({
      where: {
        user:      { clerkId: userId },
        // FIX #12: 24 h sliding window — was: { gte: todayStart (UTC midnight) }
        createdAt: { gte: windowStart },
      },
    }),
  ]);

  // ── Derive tier from DB subscription, not JWT claims ──────────────────────
  const dbSub = dbUser?.subscription ?? null;

  let tier:             UserTier  = 'free';
  let planType:         PlanType | null = null;
  let currentPeriodEnd: string | null = null;

  if (dbSub && isActive(dbSub.status, dbSub.currentPeriodEnd)) {
    tier = 'pro';
    const raw = dbSub.planType;
    planType =
      raw === 'annual'        ? 'annual'
      : raw === 'half-yearly' ? 'half-yearly'
      : 'monthly';
    currentPeriodEnd = dbSub.currentPeriodEnd?.toISOString() ?? null;
  }

  const limitsKey = getLimitsKey(tier, planType);
  const limits    = PLAN_LIMITS[limitsKey]!;

  const pastesRemainingToday = Math.max(0, limits.dailyPastes - pastesCreatedToday);

  const sub: UserSubscription = {
    tier,
    planDuration:         planType,
    pastesCreatedToday,
    pastesRemainingToday,
    dailyLimit:           limits.dailyPastes,
    maxExpiry:            limits.maxExpirySeconds,
    maxViews:             limits.maxViews,
    currentPeriodEnd,
  };

  return Response.json(sub);
}
