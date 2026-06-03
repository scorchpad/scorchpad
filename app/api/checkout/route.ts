// app/api/checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout
// Creates a provider checkout session and returns the URL.
//
// ROUTING:
//   X-Vercel-IP-Country: IN  →  Razorpay       (monthly, half-yearly, annual)
//   All other countries      →  Lemon Squeezy  (monthly, half-yearly, annual)
//
// Half-yearly is available globally via both providers.
// Razorpay handles Indian users; Lemon Squeezy handles international users.
// Ensure LEMONSQUEEZY_HALF_YEARLY_VARIANT_ID is set and the LS variant is
// correctly priced before surfacing this plan on the pricing page internationally.
//
// The country check is server-side. Client-side locale detection is spoofable
// and display-only — routing must not be delegated to the client.
//
// NO OPTIMISTIC PRO ACCESS:
//   This route returns a checkout URL only. Pro access is granted exclusively
//   by the webhook handlers after payment is confirmed by the provider.
//   The client polls GET /api/user/subscription to detect the upgrade.
//
// RUNTIME: Node.js — Razorpay SDK uses Node.js internals (crypto, https).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import Razorpay from 'razorpay';
import { lemonSqueezySetup, createCheckout } from '@lemonsqueezy/lemonsqueezy.js';
import { auth, currentUser } from '@clerk/nextjs/server';
import type { Subscriptions } from 'razorpay/dist/types/subscriptions';

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

/**
 * Total billing cycles for Razorpay subscriptions.
 * Set high enough that the subscription never terminates before the customer
 * chooses to cancel.
 */
const RAZORPAY_TOTAL_COUNT: Record<PlanDuration, number> = {
  'monthly':     600,  // 50 years
  'half-yearly': 120,  // 60 years
  'annual':      50,   // 50 years
};

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

  // ── 3. Resolve user email ──────────────────────────────────────────────────
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? '';

  // ── 4. Geo routing ─────────────────────────────────────────────────────────
  // X-Vercel-IP-Country is injected by Vercel's edge network in production.
  // Falls back to '' in local dev → routes to Lemon Squeezy (safe default).
  const country = request.headers.get('x-vercel-ip-country') ?? '';
  const isIndia  = country.toUpperCase() === 'IN';

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

// ── Lemon Squeezy checkout (international users — all three plans) ────────────

async function handleLsCheckout(
  plan:   PlanDuration,
  userId: string,
  email:  string
): Promise<Response> {
  const storeId   = Number(process.env['LEMONSQUEEZY_STORE_ID'] ?? '0');
  const variantId = getLsVariantId(plan);
  const apiKey    = process.env['LEMONSQUEEZY_API_KEY'] ?? '';

  if (!storeId || !variantId || !apiKey) {
    console.error(`[scorchpad/checkout] Missing LS config — storeId:${storeId} variantId:${variantId} hasKey:${!!apiKey}`);
    return Response.json(
      { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'ERR_CONFIG' },
      { status: 503 }
    );
  }

  try {
    lemonSqueezySetup({ apiKey });

    const result = await createCheckout(storeId, variantId, {
      checkoutOptions: { embed: false },
      checkoutData: {
        email: email || undefined,
        custom: { userId },
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
