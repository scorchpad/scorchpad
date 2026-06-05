// app/api/user/account/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user/account
// Permanently erases a user's account on their request (GDPR Art. 17).
//
// ERASURE ORDER:
//   1. Cancel active subscription at payment provider (best-effort)
//   2. Delete User row in Postgres (cascades: Subscription, PasteLog)
//   3. Delete user in Clerk (invalidates all active sessions)
//
// WHY PROVIDER CANCELLATION FIRST: If Postgres/Clerk deletion fails after we
// cancel the subscription, the user loses access but is still billed. Cancelling
// first means the worst case on partial failure is they keep access briefly
// but aren't charged again.
//
// SECURITY FIX (NEW-2 — rate limit on account deletion):
//   OLD: DELETE /api/user/account had no rate limiting. Each call attempts to
//        cancel the active subscription at the payment provider (Razorpay or
//        LemonSqueezy) before deleting from Postgres. Flooding this endpoint
//        bursts the payment provider's API rate limit, which can cause legitimate
//        cancellations from other users to fail with provider-side 429s.
//   NEW: 5 req/min per userId sliding window. Allows transient-error retries
//        (the UI may retry on a 5xx from Clerk/Postgres) without enabling abuse.
//
// PASTE BLOBS: Paste content lives in Redis with TTL — it expires naturally.
// We do not enumerate Redis keys here because we never store a userId→pasteId
// index (privacy by design: the server is intentionally blind to paste ownership).
//
// RUNTIME: Node.js — requires Prisma.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { auth, clerkClient } from '@clerk/nextjs/server';
import Razorpay from 'razorpay';
import { lemonSqueezySetup, cancelSubscription } from '@lemonsqueezy/lemonsqueezy.js';
import { db } from '../../../../lib/db';
import { accountDeleteLimit } from '../../../../lib/ratelimit';

export async function DELETE(): Promise<Response> {
  // ── 1. Auth required ───────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: 'Authentication required', code: 'ERR_UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  // FIX NEW-2: Rate limit per userId to prevent payment provider API bursting.
  const { success: withinLimit } = await accountDeleteLimit.limit(userId);
  if (!withinLimit) {
    return Response.json(
      { error: 'Too many requests. Please wait before retrying.', code: 'ERR_RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // ── 2. Find user + subscription in DB ─────────────────────────────────────
  const user = await db.user.findUnique({
    where:   { clerkId: userId },
    include: { subscription: true },
  });

  if (!user) {
    // User not in DB — still delete from Clerk (partial state from failed webhook)
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId).catch(() => null);
    return Response.json({ deleted: true });
  }

  const sub = user.subscription;

  // ── 3. Cancel subscription at payment provider (best-effort) ──────────────
  if (sub && sub.status === 'active') {
    if (sub.paymentProvider === 'lemonsqueezy' && sub.lemonSqueezySubscriptionId) {
      try {
        const apiKey = process.env['LEMONSQUEEZY_API_KEY'] ?? '';
        lemonSqueezySetup({ apiKey });
        await cancelSubscription(sub.lemonSqueezySubscriptionId);
      } catch (err) {
        console.error('[scorchpad/account/delete] LS cancellation failed:', err instanceof Error ? err.message : err);
      }
    }

    if (sub.paymentProvider === 'razorpay' && sub.razorpaySubscriptionId) {
      try {
        const razorpay = new Razorpay({
          key_id:     process.env['RAZORPAY_KEY_ID']     ?? '',
          key_secret: process.env['RAZORPAY_KEY_SECRET'] ?? '',
        });
        await razorpay.subscriptions.cancel(sub.razorpaySubscriptionId, false);
      } catch (err) {
        console.error('[scorchpad/account/delete] Razorpay cancellation failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  // ── 4. Delete from Postgres ────────────────────────────────────────────────
  try {
    await db.user.delete({ where: { clerkId: userId } });
  } catch (err) {
    console.error('[scorchpad/account/delete] DB deletion failed:', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'Account deletion failed. Please contact support.', code: 'ERR_DB' },
      { status: 500 }
    );
  }

  // ── 5. Delete from Clerk ───────────────────────────────────────────────────
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (err) {
    console.error('[scorchpad/account/delete] Clerk deletion failed:', err instanceof Error ? err.message : err);
  }

  return Response.json({ deleted: true });
}
