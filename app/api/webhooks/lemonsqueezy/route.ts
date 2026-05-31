// app/api/webhooks/lemonsqueezy/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/lemonsqueezy
// Handles LS subscription lifecycle events.
//
// SIGNATURE VERIFICATION: HMAC-SHA256 of the raw request body using
// LEMONSQUEEZY_WEBHOOK_SECRET. Must verify BEFORE parsing JSON.
//
// IDEMPOTENCY: Each event has a `meta.event_id` (the webhook delivery ID).
// We record it in WebhookEvent; a duplicate delivery (LS retries on 5xx)
// hits the unique constraint and is silently acknowledged.
//
// PRO ACCESS GRANT/REVOKE: Handled by updating Clerk publicMetadata.
// The client polls GET /api/user/subscription which reads from the DB.
// Once the DB is updated here, the next poll returns tier='pro'.
//
// DELAY EXPECTATION: 10–60 s between payment and webhook delivery is normal
// per LS documentation. Do NOT treat delay as failure.
//
// ⚠️ FLAG 1: LEMONSQUEEZY_WEBHOOK_SECRET is currently a weak string.
//    Replace with `openssl rand -hex 32` and re-register before deployment.
//
// RUNTIME: Node.js — requires Prisma + node:crypto.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { clerkClient }  from '@clerk/nextjs/server';
import { Resend }       from 'resend';
import { db }           from '../../../../lib/db';
import type { PlanType } from '../../../../lib/plan-limits';

// ── LS webhook payload shapes (subset) ───────────────────────────────────────

type LsSubscriptionAttributes = {
  status:              string;      // active | cancelled | expired | paused | past_due | unpaid | trial
  variant_id:          number;
  order_id:            number;
  current_period_end:  string | null;  // ISO-8601
  ends_at:             string | null;
};

type LsSubscriptionData = {
  id:         string;
  attributes: LsSubscriptionAttributes;
};

type LsEvent = {
  meta: {
    event_name: string;
    event_id:   string;
    custom_data?: Record<string, unknown>;
  };
  data: LsSubscriptionData;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map LS variant ID → PlanType using env vars. Returns null for unknown variants. */
function variantToPlanType(variantId: number): PlanType | null {
  const monthly = Number(process.env['LEMONSQUEEZY_MONTHLY_VARIANT_ID']      ?? 0);
  const halfYr  = Number(process.env['LEMONSQUEEZY_HALF_YEARLY_VARIANT_ID']  ?? 0);
  const annual  = Number(process.env['LEMONSQUEEZY_ANNUAL_VARIANT_ID']       ?? 0);

  if (variantId === monthly && monthly !== 0)   return 'monthly';
  if (variantId === halfYr  && halfYr  !== 0)   return 'half-yearly';
  if (variantId === annual  && annual  !== 0)   return 'annual';
  return null;
}

/** Map LS subscription status → our internal status. */
function normaliseLsStatus(lsStatus: string): string {
  switch (lsStatus) {
    case 'active':   return 'active';
    case 'cancelled': return 'cancelled';
    case 'expired':  return 'expired';
    case 'paused':   return 'paused';
    case 'past_due':
    case 'unpaid':   return 'past_due';
    default:         return lsStatus;
  }
}

/** Whether this status means the user is currently Pro. */
function isProStatus(status: string): boolean {
  return status === 'active';
}

/** Update Clerk publicMetadata to reflect subscription state. */
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

/** Send a welcome email via Resend on first activation. Fire-and-forget. */
function sendWelcomeEmail(toEmail: string, planType: PlanType): void {
  const resend    = new Resend(process.env['RESEND_API_KEY'] ?? '');
  const fromEmail = process.env['RESEND_FROM_EMAIL'] ?? 'noreply@scorchpad.rsaatlabs.com';

  const planLabel: Record<PlanType, string> = {
    'monthly':     'Monthly',
    'half-yearly': 'Half-Yearly',
    'annual':      'Annual',
  };

  resend.emails.send({
    from:    fromEmail,
    to:      toEmail,
    subject: `Welcome to ScorchPad Pro 🔥`,
    html: `
      <p>Hi,</p>
      <p>Your <strong>ScorchPad Pro ${planLabel[planType]}</strong> subscription is now active.</p>
      <p>You now have access to:</p>
      <ul>
        <li>Increased daily paste limits</li>
        <li>Extended expiry options</li>
        <li>Password-protected pastes</li>
        <li>Custom view counts</li>
      </ul>
      <p>Thank you for supporting ScorchPad.</p>
      <p>— The Rsaat Labs team</p>
    `,
  }).catch((err: unknown) => {
    // Welcome email failure must never block the webhook response
    console.error('[scorchpad/webhooks/ls] Resend error:', err instanceof Error ? err.message : err);
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // ── 1. Read raw body — must happen before any parsing ─────────────────────
  const rawBody = await request.text();

  // ── 2. Verify HMAC-SHA256 signature ───────────────────────────────────────
  const webhookSecret = process.env['LEMONSQUEEZY_WEBHOOK_SECRET'] ?? '';
  if (!webhookSecret) {
    console.error('[scorchpad/webhooks/ls] LEMONSQUEEZY_WEBHOOK_SECRET not set');
    return Response.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const receivedSig = request.headers.get('x-signature') ?? '';
  const computedSig = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const sigMatch = receivedSig.length === computedSig.length &&
    timingSafeEqual(Buffer.from(receivedSig, 'utf8'), Buffer.from(computedSig, 'utf8'));

  if (!sigMatch) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  // ── 3. Parse body ──────────────────────────────────────────────────────────
  let event: LsEvent;
  try {
    event = JSON.parse(rawBody) as LsEvent;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventId   = event.meta.event_id;
  const eventName = event.meta.event_name;

  // ── 4. Idempotency check ───────────────────────────────────────────────────
  // If this event_id is already in WebhookEvent, it's a retry we already processed.
  const alreadyProcessed = await db.webhookEvent.findUnique({ where: { eventId } });
  if (alreadyProcessed) {
    return Response.json({ received: true, duplicate: true });
  }

  // ── 5. Extract userId ──────────────────────────────────────────────────────
  const clerkUserId = typeof event.meta.custom_data?.['userId'] === 'string'
    ? event.meta.custom_data['userId']
    : null;

  if (!clerkUserId) {
    // Test webhooks from the LS dashboard won't have custom_data — acknowledge, don't process
    console.warn('[scorchpad/webhooks/ls] No userId in custom_data for event:', eventName);
    await db.webhookEvent.create({
      data: { eventId, provider: 'lemonsqueezy', eventType: eventName },
    });
    return Response.json({ received: true, skipped: 'no_user_id' });
  }

  // ── 6. Find User in Postgres ───────────────────────────────────────────────
  const user = await db.user.findUnique({ where: { clerkId: clerkUserId } });
  if (!user) {
    // Clerk webhook may not have fired yet — return 500 so LS retries
    console.warn('[scorchpad/webhooks/ls] User not found in DB for clerkId:', clerkUserId);
    return Response.json({ error: 'User not found; retry expected' }, { status: 500 });
  }

  // ── 7. Process event ───────────────────────────────────────────────────────
  const lsSub      = event.data;
  const attrs      = lsSub.attributes;
  const planType   = variantToPlanType(attrs.variant_id);
  const status     = normaliseLsStatus(attrs.status);
  const isPro      = isProStatus(status);
  const periodEnd  = attrs.current_period_end ?? attrs.ends_at ?? null;
  const periodDate = periodEnd ? new Date(periodEnd) : null;
  const lsSubId    = lsSub.id;

  try {
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated': {
        if (!planType) {
          console.warn('[scorchpad/webhooks/ls] Unknown variant_id:', attrs.variant_id);
          break;
        }

        // Upsert subscription record
        await db.subscription.upsert({
          where:  { lemonSqueezySubscriptionId: lsSubId },
          create: {
            userId:                    user.id,
            lemonSqueezySubscriptionId: lsSubId,
            lemonSqueezyOrderId:        String(attrs.order_id),
            paymentProvider:            'lemonsqueezy',
            planType,
            status,
            currentPeriodEnd:           periodDate,
          },
          update: {
            planType,
            status,
            currentPeriodEnd: periodDate,
          },
        });

        // Sync Clerk publicMetadata so JWT eventually reflects new state
        await syncClerkMetadata(clerkUserId, isPro, planType, periodEnd);

        // Welcome email only on first creation
        if (eventName === 'subscription_created' && isPro) {
          sendWelcomeEmail(user.email, planType);
        }
        break;
      }

      case 'subscription_cancelled': {
        await db.subscription.updateMany({
          where: { lemonSqueezySubscriptionId: lsSubId },
          data:  { status: 'cancelled', currentPeriodEnd: periodDate },
        });
        // Access remains until period end — isPro stays true until then
        const stillActive = periodDate ? periodDate > new Date() : false;
        await syncClerkMetadata(clerkUserId, stillActive, planType, periodEnd);
        break;
      }

      case 'subscription_expired': {
        await db.subscription.updateMany({
          where: { lemonSqueezySubscriptionId: lsSubId },
          data:  { status: 'expired', currentPeriodEnd: periodDate },
        });
        // Period has ended — revoke Pro access
        await syncClerkMetadata(clerkUserId, false, null, null);
        break;
      }

      case 'subscription_payment_success': {
        // Renewal — update the period end
        await db.subscription.updateMany({
          where: { lemonSqueezySubscriptionId: lsSubId },
          data:  { status: 'active', currentPeriodEnd: periodDate },
        });
        await syncClerkMetadata(clerkUserId, true, planType, periodEnd);
        break;
      }

      default:
        // Acknowledge unknown events without processing to prevent retries
        break;
    }

    // ── 8. Record event for idempotency ─────────────────────────────────────
    await db.webhookEvent.create({
      data: { eventId, provider: 'lemonsqueezy', eventType: eventName },
    });

  } catch (err) {
    console.error('[scorchpad/webhooks/ls] Processing error for event', eventName, err instanceof Error ? err.message : err);
    // Return 500 so LS retries on transient errors
    // Do NOT record the event — let LS retry
    return Response.json({ error: 'Processing failed' }, { status: 500 });
  }

  return Response.json({ received: true });
}
