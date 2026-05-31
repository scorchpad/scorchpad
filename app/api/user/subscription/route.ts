// app/api/user/subscription/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user/subscription
// Returns the caller's current subscription state as a UserSubscription object.
//
// Serves two frontend calls:
//   getCurrentUser()       — called on page load / editor mount
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
// RUNTIME: Node.js — requires Prisma.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { db }   from '../../../../lib/db';
import {
  PLAN_LIMITS,
  getLimitsKey,
  type UserTier,
  type PlanType,
} from '../../../../lib/plan-limits';

// ── Types ─────────────────────────────────────────────────────────────────────

// Mirror of UserSubscription in src/mocks/api.mock.ts.
// Field names must be identical — a mismatch breaks the wiring silently.
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

/**
 * A subscription is active if:
 *   status = 'active'  AND
 *   currentPeriodEnd is null (no end date) OR in the future.
 */
function isActive(status: string, periodEnd: Date | null): boolean {
  if (status !== 'active') return false;
  if (periodEnd === null)  return true;
  return periodEnd > new Date();
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const { userId } = await auth();

  // ── Anonymous — no DB query needed ─────────────────────────────────────────
  if (!userId) {
    const limits = PLAN_LIMITS['anonymous']!;
    const sub: UserSubscription = {
      tier:                 'anonymous',
      planDuration:         null,
      pastesCreatedToday:   0,   // anonymous users have no persistent identity to count
      pastesRemainingToday: limits.dailyPastes,
      dailyLimit:           limits.dailyPastes,
      maxExpiry:            limits.maxExpirySeconds,
      maxViews:             limits.maxViews,
      currentPeriodEnd:     null,
    };
    return Response.json(sub);
  }

  // ── Authenticated — query DB for fresh subscription state ──────────────────
  // UTC midnight for "today" boundary — consistent with how rate limiters count.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Run both queries in parallel to minimise latency.
  const [dbUser, pastesCreatedToday] = await Promise.all([
    db.user.findUnique({
      where:   { clerkId: userId },
      include: { subscription: true },
    }),
    db.pasteLog.count({
      where: {
        user:      { clerkId: userId },
        createdAt: { gte: todayStart },
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
    // planType from DB is the canonical value set by the webhook handler.
    const raw = dbSub.planType;
    planType =
      raw === 'annual'      ? 'annual'
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
