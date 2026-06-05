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
// SECURITY FIX (M2 — webhook endpoint rate limiting):
//   OLD: No rate limiting. An attacker could flood this endpoint to force
//        repeated HMAC-SHA256 verification + DB idempotency queries per
//        request, exhausting the Postgres connection pool and serverless slots.
//   NEW: 200 req/min per IP sliding window. Well above legitimate LS delivery
//        frequency (providers retry at most every few seconds on failure, and
//        deliver each event once on success). Stops replay floods and
//        connection-pool exhaustion attacks.
//
// RUNTIME: Node.js — requires Prisma + node:crypto.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { clerkClient }  from '@clerk/nextjs/server';
import { Resend }       from 'resend';
import { db }           from '../../../../lib/db';
import { getClientIp, hashIp } from '../../../../lib/ip';
import { webhookLimit } from '../../../../lib/ratelimit';
import type { PlanType } from '../../../../lib/plan-limits';

// ── LS webhook payload shapes (subset) ───────────────────────────────────────

type LsSubscriptionAttributes = {
  status:              string;
  variant_id:          number;
  order_id:            number;
  current_period_end:  string | null;
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

function variantToPlanType(variantId: number): PlanType | null {
  const monthly = Number(process.env['LEMONSQUEEZY_MONTHLY_VARIANT_ID']      ?? 0);
  const halfYr  = Number(process.env['LEMONSQUEEZY_HALF_YEARLY_VARIANT_ID']  ?? 0);
  const annual  = Number(process.env['LEMONSQUEEZY_ANNUAL_VARIANT_ID']       ?? 0);

  if (variantId === monthly && monthly !== 0)   return 'monthly';
  if (variantId === halfYr  && halfYr  !== 0)   return 'half-yearly';
  if (variantId === annual  && annual  !== 0)   return 'annual';
  return null;
}

function normaliseLsStatus(lsStatus: string): string {
  switch (lsStatus) {
    case 'active':    return 'active';
    case 'cancelled': return 'cancelled';
    case 'expired':   return 'expired';
    case 'paused':    return 'paused';
    case 'past_due':
    case 'unpaid':    return 'past_due';
    default:          return lsStatus;
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
  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      isPro,
      planType:         isPro ? planType : null,
      currentPeriodEnd: isPro ? periodEnd : null,
    },
  });
}

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
    console.error('[scorchpad/webhooks/ls] Resend error:', err instanceof Error ? err.message : err);
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // FIX M2: Rate limit before any expensive work (HMAC, DB queries).
  // Use 200/min per IP — well above legitimate LS delivery rates.
  const rawIp  = getClientIp(request);
  const ipHash = await hashIp(rawIp);
  const { success: withinLimit } = await webhookLimit.limit(ipHash);
  if (!withinLimit) {
    // Return 429 here (unlike csp-report) — LS delivery should back off on 429.
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

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
  const alreadyProcessed = await db.webhookEvent.findUnique({ where: { eventId } });
  if (alreadyProcessed) {
    return Response.json({ received: true, duplicate: true });
  }

  // ── 5. Extract userId ──────────────────────────────────────────────────────
  const clerkUserId = typeof event.meta.custom_data?.['userId'] === 'string'
    ? event.meta.custom_data['userId']
    : null;

  if (!clerkUserId) {
    console.warn('[scorchpad/webhooks/ls] No userId in custom_data for event:', eventName);
    await db.webhookEvent.create({
      data: { eventId, provider: 'lemonsqueezy', eventType: eventName },
    });
    return Response.json({ received: true, skipped: 'no_user_id' });
  }

  // ── 6. Find User in Postgres ───────────────────────────────────────────────
  const user = await db.user.findUnique({ where: { clerkId: clerkUserId } });
  if (!user) {
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

        await syncClerkMetadata(clerkUserId, isPro, planType, periodEnd);

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
        const stillActive = periodDate ? periodDate > new Date() : false;
        await syncClerkMetadata(clerkUserId, stillActive, planType, periodEnd);
        break;
      }

      case 'subscription_expired': {
        await db.subscription.updateMany({
          where: { lemonSqueezySubscriptionId: lsSubId },
          data:  { status: 'expired', currentPeriodEnd: periodDate },
        });
        await syncClerkMetadata(clerkUserId, false, null, null);
        break;
      }

      case 'subscription_payment_success': {
        await db.subscription.updateMany({
          where: { lemonSqueezySubscriptionId: lsSubId },
          data:  { status: 'active', currentPeriodEnd: periodDate },
        });
        await syncClerkMetadata(clerkUserId, true, planType, periodEnd);
        break;
      }

      default:
        break;
    }

    await db.webhookEvent.create({
      data: { eventId, provider: 'lemonsqueezy', eventType: eventName },
    });

  } catch (err) {
    console.error('[scorchpad/webhooks/ls] Processing error for event', eventName, err instanceof Error ? err.message : err);
    return Response.json({ error: 'Processing failed' }, { status: 500 });
  }

  return Response.json({ received: true });
}
