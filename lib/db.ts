// lib/db.ts
// ─────────────────────────────────────────────────────────────────────────────
// Prisma client singleton for Next.js App Router.
//
// WHY SINGLETON: Next.js dev mode hot-reloads modules, which would create a new
// PrismaClient on every reload — exhausting the Supabase connection pool fast.
// Storing the instance on `globalThis` survives hot-reloads in development.
//
// RUNTIME: Node.js only. Never import this in middleware.ts (Edge runtime).
// Middleware derives tier from Clerk sessionClaims — zero DB calls there.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';

// Augment globalThis to hold the dev-mode singleton without TypeScript errors.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Persist across hot-reloads in development only.
// Production creates a new instance per serverless function cold start — correct behaviour.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
