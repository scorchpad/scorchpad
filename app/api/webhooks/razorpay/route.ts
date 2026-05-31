// app/api/webhooks/razorpay/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/razorpay
// Handles Razorpay subscription lifecycle events (Indian users).
//
// SIGNATURE VERIFICATION: HMAC-SHA256 of the raw request body using
// RAZORPAY_WEBHOOK_SECRET. Uses timingSafeEqual to prevent timing attacks.
//
// IDEMPOTENCY: Razorpay can deliver the same event multiple times on retries.
// We construct a stable event ID from event type + subscription ID + timestamp
// and record it in WebhookEvent to deduplicate.
//
// PRO GRANT/REVOKE: Same pattern as the LS handler — update Postgres then
// update Clerk publicMetadata. The subscription endpoint reads from Postgres.
//
// ⚠️ FLAG 1: RAZORPAY_WEBHOOK_SECRET is currently a weak string.
//    Replace with `openssl rand -hex 32` and re-register before deployment.
//
// RUNTIME: Node.js — requires Prisma + node:crypto.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { clerkClient }  from '@clerk/nextjs/server';
import { db }           from '../../../../lib/db';
import type { PlanType } from '../../../../lib/plan-limits';

// ── Razorpay webhook payload shapes (subset) ──────────────────────────────────

type RazorpaySubscriptionEntity = {
  id:            string;
  plan_id:       string;
  status:        string;
  current_start: number;   // Unix timestamp (seconds)
  current_end:   number;   // Unix timestamp (seconds)
  notes:         Record<string, string>;
};

type RazorpayEvent = {
  event:      string;
  created_at: number;  // Unix timestamp (seconds)
  payload: {
    subscription?: {
      entity: RazorpaySubscriptionEntity;
    };
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map Razorpay plan_id → PlanType using env vars. */
function planIdToPlanType(planId: string): PlanType | null {
  if (planId === process.env['RAZORPAY_MONTHLY_PLAN_ID'])     return 'monthly';
  if (planId === process.env['RAZORPAY_HALF_YEARLY_PLAN_ID']) return 'half-yearly';
  if (planId === process.env['RAZORPAY_ANNUAL_PLAN_ID'])      return 'annual';
  return null;
}

/** Map Razorpay subscription status → internal status. */
function normaliseRpStatus(rpStatus: string): string {
  switch (rpStatus) {
    case 'created':
    case 'authenticated':
    case 'active':    return 'active';
    case 'pending':   return 'active';   // pending charge — treat as active
    case 'halted':    return 'past_due';
    case 'cancelled': return 'cancelled';
    case 'completed': return 'expired';  // all billing cycles used
    case 'expired':   return 'expired';
    default:          return rpStatus;
  }
}

function isProStatus(status: string): boolean {
  return status === 'active';
}

async function syncClerkMetadata(
  clerkUserId: string,
  isPro:       boolean,
  planType:    PlanType | null,
  periodEnd:   string | null
): Promise<void> {
  // clerkClient() returns Promise<ClerkClient> in @clerk/nextjs v7 — must await
  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      isPro,
      planType:         isPro ? planType : null,
      currentPeriodEnd: isPro ? periodEnd : null,
    },
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // ── 1. Read raw body ───────────────────────────────────────────────────────
  const rawBody = await request.text();

  // ── 2. Verify HMAC-SHA256 signature ───────────────────────────────────────
  const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'] ?? '';
  if (!webhookSecret) {
    console.error('[scorchpad/webhooks/razorpay] RAZORPAY_WEBHOOK_SECRET not set');
    return Response.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const receivedSig = request.headers.get('x-razorpay-signature') ?? '';
  const computedSig = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  // timingSafeEqual requires same-length buffers — compare hex strings (always 64 chars)
  const sigMatch =
    receivedSig.length === 64 &&
    computedSig.length === 64 &&
    timingSafeEqual(Buffer.from(receivedSig, 'utf8'), Buffer.from(computedSig, 'utf8'));

  if (!sigMatch) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  // ── 3. Parse body ──────────────────────────────────────────────────────────
  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subscription = event.payload.subscription?.entity;
  if (!subscription) {
    // Non-subscription event (e.g. payment.captured) — acknowledge, skip
    return Response.json({ received: true, skipped: 'non_subscription_event' });
  }

  // ── 4. Idempotency check ───────────────────────────────────────────────────
  // Razorpay has no per-event UUID. Construct a stable key from event + sub ID + timestamp.
  const eventId = `rp:${event.event}:${subscription.id}:${event.created_at}`;
  const alreadyProcessed = await db.webhookEvent.findUnique({ where: { eventId } });
  if (alreadyProcessed) {
    return Response.json({ received: true, duplicate: true });
  }

  // ── 5. Extract userId from subscription notes ──────────────────────────────
  const clerkUserId = subscription.notes['userId'] ?? null;
  if (!clerkUserId) {
    console.warn('[scorchpad/webhooks/razorpay] No userId in subscription notes:', subscription.id);
    await db.webhookEvent.create({
      data: { eventId, provider: 'razorpay', eventType: event.event },
    });
    return Response.json({ received: true, skipped: 'no_user_id' });
  }

  // ── 6. Find User in Postgres ───────────────────────────────────────────────
  const user = await db.user.findUnique({ where: { clerkId: clerkUserId } });
  if (!user) {
    console.warn('[scorchpad/webhooks/razorpay] User not found:', clerkUserId);
    return Response.json({ error: 'User not found; retry expected' }, { status: 500 });
  }

  // ── 7. Process event ───────────────────────────────────────────────────────
  const planType   = planIdToPlanType(subscription.plan_id);
  const status     = normaliseRpStatus(subscription.status);
  const isPro      = isProStatus(status);
  const periodDate = subscription.current_end
    ? new Date(subscription.current_end * 1000)   // seconds → ms
    : null;
  const periodIso  = periodDate?.toISOString() ?? null;

  try {
    switch (event.event) {
      case 'subscription.activated':
      case 'subscription.authenticated': {
        if (!planType) {
          console.warn('[scorchpad/webhooks/razorpay] Unknown plan_id:', subscription.plan_id);
          break;
        }

        await db.subscription.upsert({
          where:  { razorpaySubscriptionId: subscription.id },
          create: {
            userId:                user.id,
            razorpaySubscriptionId: subscription.id,
            paymentProvider:       'razorpay',
            planType,
            status:                'active',
            currentPeriodEnd:      periodDate,
          },
          update: {
            planType,
            status:          'active',
            currentPeriodEnd: periodDate,
          },
        });

        await syncClerkMetadata(clerkUserId, true, planType, periodIso);
        break;
      }

      case 'subscription.charged': {
        // Successful renewal — update period end
        await db.subscription.updateMany({
          where: { razorpaySubscriptionId: subscription.id },
          data:  { status: 'active', currentPeriodEnd: periodDate },
        });
        await syncClerkMetadata(clerkUserId, true, planType, periodIso);
        break;
      }

      case 'subscription.cancelled':
      case 'subscription.completed': {
        await db.subscription.updateMany({
          where: { razorpaySubscriptionId: subscription.id },
          data:  { status: normaliseRpStatus(subscription.status), currentPeriodEnd: periodDate },
        });
        // Access continues until period end on cancellation
        const stillActive = event.event === 'subscription.cancelled'
          ? (periodDate ? periodDate > new Date() : false)
          : false;
        await syncClerkMetadata(clerkUserId, stillActive, planType, periodIso);
        break;
      }

      case 'subscription.halted': {
        // Payment failed — mark as past_due but keep access until period end
        await db.subscription.updateMany({
          where: { razorpaySubscriptionId: subscription.id },
          data:  { status: 'past_due' },
        });
        // Keep isPro = true during the grace period; webhook will fire again on recovery
        break;
      }

      case 'subscription.resumed': {
        await db.subscription.updateMany({
          where: { razorpaySubscriptionId: subscription.id },
          data:  { status: 'active', currentPeriodEnd: periodDate },
        });
        await syncClerkMetadata(clerkUserId, true, planType, periodIso);
        break;
      }

      default:
        break;
    }

    // ── 8. Record for idempotency ───────────────────────────────────────────
    await db.webhookEvent.create({
      data: { eventId, provider: 'razorpay', eventType: event.event },
    });

  } catch (err) {
    console.error('[scorchpad/webhooks/razorpay] Error on event', event.event, err instanceof Error ? err.message : err);
    // Do NOT record event — let Razorpay retry
    return Response.json({ error: 'Processing failed' }, { status: 500 });
  }

  return Response.json({ received: true });
}
