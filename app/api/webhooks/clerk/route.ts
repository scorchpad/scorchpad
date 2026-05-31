// app/api/webhooks/clerk/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/clerk
// Syncs Clerk user lifecycle events to Postgres.
//
// Events handled:
//   user.created  → INSERT User row
//   user.updated  → UPDATE email
//   user.deleted  → DELETE User (Subscription + PasteLog cascade automatically)
//
// SIGNATURE VERIFICATION: Svix signs every Clerk webhook with HMAC-SHA256.
// Reject immediately on bad signature — don't process body at all.
//
// RUNTIME: Node.js — requires Prisma.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { Webhook } from 'svix';
import { db } from '../../../../lib/db';

// ── Clerk event shapes (subset we care about) ─────────────────────────────────

type ClerkEmailAddress = {
  id:            string;
  email_address: string;
};

type ClerkUserCreatedData = {
  id:               string;
  email_addresses:  ClerkEmailAddress[];
  primary_email_address_id: string;
};

type ClerkUserUpdatedData = {
  id:               string;
  email_addresses:  ClerkEmailAddress[];
  primary_email_address_id: string;
};

type ClerkUserDeletedData = {
  id:      string;
  deleted: boolean;
};

type ClerkEvent =
  | { type: 'user.created'; data: ClerkUserCreatedData }
  | { type: 'user.updated'; data: ClerkUserUpdatedData }
  | { type: 'user.deleted'; data: ClerkUserDeletedData }
  | { type: string;         data: unknown };

// ── Helper ────────────────────────────────────────────────────────────────────

function extractPrimaryEmail(
  emailAddresses: ClerkEmailAddress[],
  primaryId:      string
): string {
  const primary = emailAddresses.find((e) => e.id === primaryId);
  return primary?.email_address ?? emailAddresses[0]?.email_address ?? '';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // ── 1. Read raw body — required for Svix verification ─────────────────────
  const rawBody = await request.text();

  // ── 2. Verify Svix signature ───────────────────────────────────────────────
  const svixId        = request.headers.get('svix-id')        ?? '';
  const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
  const svixSignature = request.headers.get('svix-signature') ?? '';

  const webhookSecret = process.env['CLERK_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    console.error('[scorchpad/webhooks/clerk] CLERK_WEBHOOK_SECRET not set');
    return Response.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: ClerkEvent;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent;
  } catch {
    // Bad signature — do not log body (may contain PII)
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  // ── 3. Process event ───────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case 'user.created': {
        const d = event.data as ClerkUserCreatedData;
        const email = extractPrimaryEmail(d.email_addresses, d.primary_email_address_id);
        await db.user.create({
          data: { clerkId: d.id, email },
        });
        break;
      }

      case 'user.updated': {
        const d = event.data as ClerkUserUpdatedData;
        const email = extractPrimaryEmail(d.email_addresses, d.primary_email_address_id);
        await db.user.update({
          where: { clerkId: d.id },
          data:  { email },
        });
        break;
      }

      case 'user.deleted': {
        const d = event.data as ClerkUserDeletedData;
        if (!d.deleted) break; // Clerk sends this even for soft deletes — guard
        // DELETE cascades to Subscription and PasteLog (onDelete: Cascade in schema)
        await db.user.delete({ where: { clerkId: d.id } }).catch((err: unknown) => {
          // User may not exist yet if webhook fired before user.created — safe to ignore
          console.warn('[scorchpad/webhooks/clerk] user.deleted for unknown user:', d.id, err instanceof Error ? err.message : err);
        });
        break;
      }

      default:
        // Unknown event type — return 200 to prevent Clerk from retrying
        break;
    }
  } catch (err) {
    console.error('[scorchpad/webhooks/clerk] DB error on event', event.type, err instanceof Error ? err.message : err);
    // Return 500 so Clerk retries — transient DB errors should resolve
    return Response.json({ error: 'Processing failed' }, { status: 500 });
  }

  return Response.json({ received: true });
}
