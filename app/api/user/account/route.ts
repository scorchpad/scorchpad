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

export async function DELETE(): Promise<Response> {
  // ── 1. Auth required ───────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: 'Authentication required', code: 'ERR_UNAUTHENTICATED' },
      { status: 401 }
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
        // Log but do not block erasure — user's right to be forgotten takes precedence
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
  // Subscription and PasteLog rows cascade via onDelete: Cascade in schema.
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
  // This invalidates all active sessions immediately.
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (err) {
    // Postgres is already clean — log Clerk failure but return success.
    // The user's data is gone; Clerk orphan cleanup can be handled manually.
    console.error('[scorchpad/account/delete] Clerk deletion failed:', err instanceof Error ? err.message : err);
  }

  return Response.json({ deleted: true });
}
