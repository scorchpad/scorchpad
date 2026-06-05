// app/api/checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout
// Creates a provider checkout session and returns the URL.
//
// ROUTING:
//   X-Vercel-IP-Country: IN  →  Razorpay       (monthly, half-yearly, annual)
//   All other countries      →  Lemon Squeezy  (monthly, half-yearly, annual)
//
// NOTE (M3 — geo routing spoofing):
//   x-vercel-ip-country shares the same root vulnerability as C1: an attacker
//   who discovers the raw Vercel origin URL can bypass Cloudflare and inject
//   any country header, routing themselves to whichever payment provider they
//   prefer. The application-layer fix in lib/ip.ts (Cloudflare IP validation)
//   mitigates this for all IP-derived headers. The correct infrastructure-level
//   fix is Cloudflare Authenticated Origin Pulls (mTLS), which prevents any
//   direct Vercel access entirely.
//
// NO OPTIMISTIC PRO ACCESS:
//   This route returns a checkout URL only. Pro access is granted exclusively
//   by the webhook handlers after payment is confirmed by the provider.
//
// SECURITY FIXES (this version):
//
//   FIX L1 — Rate limit (NEW):
//     OLD: No rate limiting. A tight loop could create Razorpay subscription
//          objects or LemonSqueezy checkout sessions on every call, burning
//          provider API quota and potentially triggering fraud flags.
//     NEW: 10 req/min per userId sliding window. More than enough for any
//          legitimate user flow (one click → one URL), allows retries on
//          transient errors.
//
//   FIX S3 — Subscription pre-flight check (NEW):
//     OLD: No check for existing active subscription before creating a new
//          checkout session. A user with an active subscription could create
//          a parallel pending subscription at the provider, leading to double-
//          charging, failed reconciliation, and confusing state in the DB.
//     NEW: Check for an active or pending subscription in Postgres before
//          calling the provider API. If one exists, return 409 ERR_ALREADY_SUBSCRIBED
//          so the client can redirect to account management instead.
//
// RUNTIME: Node.js — Razorpay SDK uses Node.js internals (crypto, https).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import Razorpay from 'razorpay';
import { lemonSqueezySetup, createCheckout } from '@lemonsqueezy/lemonsqueezy.js';
import { auth, currentUser } from '@clerk/nextjs/server';
import type { Subscriptions } from 'razorpay/dist/types/subscriptions';

import { db }           from '../../../lib/db';
import { getClientIp, hashIp } from '../../../lib/ip';
import { checkoutLimit } from '../../../lib/ratelimit';

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanDuration = 'monthly' | 'half-yearly' | 'annual';

const VALID_PLANS = new Set<PlanDuration>(['monthly', 'half-yearly', 'annual']);

function isValidPlan(v: unknown): v is PlanDuration {
  return typeof v === 'string' && VALID_PLANS.has(v as PlanDuration);
}

// ── Plan → provider ID maps ───────────────────────────────────────────────────

function getRazorpayPlanId(plan: PlanDuration): string {
  switch (plan) {
    case 'monthly':     return process.env['RAZORPAY_MONTHLY_PLAN_ID']     ?? '';
    case 'half-yearly': return process.env['RAZORPAY_HALF_YEARLY_PLAN_ID'] ?? '';
    case 'annual':      return process.env['RAZORPAY_ANNUAL_PLAN_ID']      ?? '';
  }
}

function getLsVariantId(plan: PlanDuration): number {
  const raw = (() => {
    switch (plan) {
      case 'monthly':     return process.env['LEMONSQUEEZY_MONTHLY_VARIANT_ID'];
      case 'half-yearly': return process.env['LEMONSQUEEZY_HALF_YEARLY_VARIANT_ID'];
      case 'annual':      return process.env['LEMONSQUEEZY_ANNUAL_VARIANT_ID'];
    }
  })();
  return raw ? Number(raw) : 0;
}

const RAZORPAY_TOTAL_COUNT: Record<PlanDuration, number> = {
  'monthly':     600,
  'half-yearly': 120,
  'annual':      50,
};

// ── Active subscription statuses that block new checkout ─────────────────────
// 'cancelled' and 'expired' are intentionally excluded — a cancelled user
// reaching end-of-period or an expired subscriber should be able to re-subscribe.
const BLOCKING_STATUSES = new Set(['active', 'past_due']);

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // ── 1. Auth required ───────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: 'Sign in to subscribe', code: 'ERR_UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  // FIX L1: Rate limit per userId before any provider API call.
  const rawIp  = getClientIp(request);
  const ipHash = await hashIp(rawIp);
  // Use userId as rate-limit key (stable across IP changes for authenticated users).
  // Fall back to ipHash if userId is somehow unavailable (shouldn't happen after
  // the auth() check above, but belt-and-suspenders).
  const rlKey = userId ?? ipHash;
  const { success: withinLimit } = await checkoutLimit.limit(rlKey);
  if (!withinLimit) {
    return Response.json(
      { error: 'Too many checkout requests. Please wait a moment and try again.', code: 'ERR_RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // ── 2. Validate body ───────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', code: 'ERR_INVALID_BODY' },
      { status: 400 }
    );
  }

  const raw = body as Record<string, unknown>;
  if (!isValidPlan(raw['plan'])) {
    return Response.json(
      { error: `plan must be one of: ${[...VALID_PLANS].join(', ')}`, code: 'ERR_INVALID_PLAN' },
      { status: 400 }
    );
  }
  const plan = raw['plan'];

  // FIX S3: Check for an existing active subscription before creating a new
  // checkout session. This prevents double-subscription and duplicate charges.
  const dbUser = await db.user.findUnique({
    where:   { clerkId: userId },
    include: { subscription: { select: { status: true } } },
  });

  if (dbUser?.subscription && BLOCKING_STATUSES.has(dbUser.subscription.status)) {
    return Response.json(
      {
        error: 'You already have an active subscription. Manage it from your account settings.',
        code:  'ERR_ALREADY_SUBSCRIBED',
      },
      { status: 409 }
    );
  }

  // ── 3. Resolve user email ──────────────────────────────────────────────────
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? '';

  // ── 4. Routing: explicit client region overrides geo-detection ────────────
  // When the user explicitly selects the $ (International) or India tab on
  // the pricing page, that selection is sent as raw['region']. We honour it
  // directly so an Indian user who chose International gets Lemon Squeezy,
  // and a non-Indian user who chose India gets Razorpay.
  // If no region is sent (direct API call), fall back to x-vercel-ip-country.
  const clientRegion = (() => {
    const r = raw['region'];
    if (r === 'india' || r === 'intl') return r as 'india' | 'intl';
    return null;
  })();
  const country = request.headers.get('x-vercel-ip-country') ?? '';
  const isIndia = clientRegion === 'india' ? true
                : clientRegion === 'intl'  ? false
                : country.toUpperCase() === 'IN';

  if (isIndia) {
    return handleRazorpayCheckout(plan, userId, email);
  }
  return handleLsCheckout(plan, userId, email);
}

// ── Razorpay checkout (Indian users) ─────────────────────────────────────────

async function handleRazorpayCheckout(
  plan:   PlanDuration,
  userId: string,
  email:  string
): Promise<Response> {
  const planId = getRazorpayPlanId(plan);
  if (!planId) {
    console.error(`[scorchpad/checkout] RAZORPAY_${plan.toUpperCase().replace(/-/g, '_')}_PLAN_ID not set`);
    return Response.json(
      { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'ERR_CONFIG' },
      { status: 503 }
    );
  }

  const keyId     = process.env['RAZORPAY_KEY_ID']     ?? '';
  const keySecret = process.env['RAZORPAY_KEY_SECRET'] ?? '';

  if (!keyId || !keySecret) {
    console.error('[scorchpad/checkout] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set');
    return Response.json(
      { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'ERR_CONFIG' },
      { status: 503 }
    );
  }

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const subscriptionBody: Subscriptions.RazorpaySubscriptionCreateRequestBody = {
      plan_id:         planId,
      total_count:     RAZORPAY_TOTAL_COUNT[plan],
      quantity:        1,
      customer_notify: 1,
      ...(email ? { notify_info: { notify_email: email } } : {}),
      notes:           { userId, plan },
    };

    const subscription = await razorpay.subscriptions.create(subscriptionBody);

    const checkoutUrl = subscription.short_url;
    if (!checkoutUrl || typeof checkoutUrl !== 'string') {
      console.error('[scorchpad/checkout] Razorpay returned no short_url', subscription);
      return Response.json(
        { error: 'Provider did not return a checkout URL', code: 'ERR_PROVIDER' },
        { status: 502 }
      );
    }

    return Response.json({ checkoutUrl });
  } catch (err) {
    console.error('[scorchpad/checkout] Razorpay API error:', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'ERR_PROVIDER' },
      { status: 502 }
    );
  }
}

// ── Lemon Squeezy checkout (international users) ──────────────────────────────
//
// WEBHOOK URL:
//   Lemon Squeezy subscription lifecycle events (subscription_created,
//   subscription_updated, subscription_cancelled, subscription_expired,
//   subscription_payment_success) are delivered to:
//
//     https://scorchpad.rsaatlabs.com/api/webhooks/lemonsqueezy
//
//   This URL is read from LEMONSQUEEZY_WEBHOOK_URL and must be registered in
//   the Lemon Squeezy Dashboard → Settings → Webhooks, or via createWebhook()
//   during initial store setup. The HMAC secret used to verify incoming
//   payloads is LEMONSQUEEZY_WEBHOOK_SECRET.

async function handleLsCheckout(
  plan:   PlanDuration,
  userId: string,
  email:  string
): Promise<Response> {
  const storeId    = Number(process.env['LEMONSQUEEZY_STORE_ID'] ?? '0');
  const variantId  = getLsVariantId(plan);
  const apiKey     = process.env['LEMONSQUEEZY_API_KEY'] ?? '';
  const webhookUrl = process.env['LEMONSQUEEZY_WEBHOOK_URL'] ?? 'https://scorchpad.rsaatlabs.com/api/webhooks/lemonsqueezy';
  const appUrl     = process.env['NEXT_PUBLIC_APP_URL']      ?? 'https://scorchpad.rsaatlabs.com';

  if (!storeId || !variantId || !apiKey) {
    console.error(`[scorchpad/checkout] Missing LS config — storeId:${storeId} variantId:${variantId} hasKey:${!!apiKey}`);
    return Response.json(
      { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'ERR_CONFIG' },
      { status: 503 }
    );
  }

  if (!webhookUrl) {
    console.error('[scorchpad/checkout] LEMONSQUEEZY_WEBHOOK_URL is not set — webhook deliveries will fail');
  }

  try {
    lemonSqueezySetup({ apiKey });

    const result = await createCheckout(storeId, variantId, {
      checkoutOptions: { embed: false },
      checkoutData: {
        email:  email || undefined,
        custom: { userId },
      },
      productOptions: {
        // Redirect the customer back to the dashboard after a successful
        // payment. Pro access itself is granted by the webhook handler
        // (app/api/webhooks/lemonsqueezy/route.ts) once Lemon Squeezy
        // delivers the subscription_created event to LEMONSQUEEZY_WEBHOOK_URL.
        redirectUrl: `${appUrl}/dashboard`,
      },
    });

    if (result.error) {
      console.error('[scorchpad/checkout] LS API error:', result.error);
      return Response.json(
        { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'ERR_PROVIDER' },
        { status: 502 }
      );
    }

    const checkoutUrl = result.data?.data?.attributes?.url;
    if (!checkoutUrl || typeof checkoutUrl !== 'string') {
      console.error('[scorchpad/checkout] LS returned no checkout URL', result);
      return Response.json(
        { error: 'Provider did not return a checkout URL', code: 'ERR_PROVIDER' },
        { status: 502 }
      );
    }

    return Response.json({ checkoutUrl });
  } catch (err) {
    console.error('[scorchpad/checkout] LS exception:', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'ERR_PROVIDER' },
      { status: 502 }
    );
  }
}
