// lib/db.ts
// ─────────────────────────────────────────────────────────────────────────────
// Prisma client singleton for Next.js App Router.
//
// WHY SINGLETON: Next.js dev mode hot-reloads modules, which would create a new
// PrismaClient on every reload — exhausting the Supabase connection pool fast.
// Storing the instance on `globalThis` survives hot-reloads in development.
//
// PRISMA 7 ADAPTER: Connection is provided via @prisma/adapter-pg instead of
// the schema.prisma datasource url. DATABASE_URL (pgbouncer, port 6543) is used
// here for runtime queries — the pool handles connection reuse across invocations.
//
// RUNTIME: Node.js only. Never import this in middleware.ts (Edge runtime).
// Middleware derives tier from Clerk sessionClaims — zero DB calls there.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Augment globalThis to hold the dev-mode singleton without TypeScript errors.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  // pg.Pool manages the connection lifecycle for serverless functions.
  // DATABASE_URL points to Supabase's pgbouncer (port 6543) — connection pooling
  // is critical in serverless because every cold start would otherwise open a new
  // direct Postgres connection and exhaust Supabase's connection limit quickly.
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const db: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

// Persist across hot-reloads in development only.
// Production creates a new instance per serverless function cold start — correct behaviour.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
