-- Migration: 20260531000000_init
-- Generated from prisma/schema.prisma
-- Apply with: npx prisma migrate deploy
-- Or directly: psql $DIRECT_URL < prisma/migrations/20260531000000_init/migration.sql

-- ── User ──────────────────────────────────────────────────────────────────────
CREATE TABLE "User" (
    "id"        TEXT NOT NULL,
    "clerkId"   TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey"    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
CREATE UNIQUE INDEX "User_email_key"   ON "User"("email");

-- ── Subscription ──────────────────────────────────────────────────────────────
CREATE TABLE "Subscription" (
    "id"                          TEXT NOT NULL,
    "userId"                      TEXT NOT NULL,
    "lemonSqueezySubscriptionId"  TEXT,
    "lemonSqueezyOrderId"         TEXT,
    "razorpaySubscriptionId"      TEXT,
    "razorpayPaymentId"           TEXT,
    "paymentProvider"             TEXT NOT NULL DEFAULT 'lemonsqueezy',
    "planType"                    TEXT NOT NULL,
    "status"                      TEXT NOT NULL,
    "currentPeriodEnd"            TIMESTAMP(3),
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_userId_key"                      ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_lemonSqueezySubscriptionId_key"  ON "Subscription"("lemonSqueezySubscriptionId");
CREATE UNIQUE INDEX "Subscription_lemonSqueezyOrderId_key"         ON "Subscription"("lemonSqueezyOrderId");
CREATE UNIQUE INDEX "Subscription_razorpaySubscriptionId_key"      ON "Subscription"("razorpaySubscriptionId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── PasteLog ──────────────────────────────────────────────────────────────────
-- Stores paste metadata only — never content, never the decryption key.
CREATE TABLE "PasteLog" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT,
    "ipHash"    TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasteLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasteLog_userId_createdAt_idx" ON "PasteLog"("userId", "createdAt");
CREATE INDEX "PasteLog_ipHash_createdAt_idx" ON "PasteLog"("ipHash", "createdAt");

ALTER TABLE "PasteLog" ADD CONSTRAINT "PasteLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── WebhookEvent ─────────────────────────────────────────────────────────────
-- Idempotency table — one row per processed webhook event.
-- eventId is the provider-supplied unique ID; the UNIQUE constraint prevents
-- double-processing on retries.
CREATE TABLE "WebhookEvent" (
    "id"          TEXT NOT NULL,
    "eventId"     TEXT NOT NULL,
    "provider"    TEXT NOT NULL,
    "eventType"   TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");
