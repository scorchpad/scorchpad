// lib/db.ts
// ─────────────────────────────────────────────────────────────────────────────
// Prisma v7 client singleton — Node.js App Router runtime only.
//
// ─── WHY THIS FILE CHANGED (Prisma v7 driver adapters) ──────────────────────
// Prisma v7 retired the embedded Rust engine binary and made driver adapters
// the default engine type ("client"). The PrismaClient constructor now enforces
// a hard contract:
//
//   new PrismaClient()              ← PrismaClientConstructorValidationError
//   new PrismaClient({ adapter })   ← correct
//
// The Prisma v6 behaviour — auto-reading DATABASE_URL from the schema's
// datasource block at runtime — no longer exists. Connection config flows
// exclusively through the adapter supplied to the constructor.
//
// Packages already in package.json (no new installs required):
//   @prisma/client@7.8.0
//   @prisma/adapter-pg@7.8.0   ← PrismaPg; bundles its own pg types internally
//   pg@8.13.1                  ← also in top-level deps for other consumers
//   @types/pg@8.11.10          ← also in top-level devDependencies
//
// ─── WHY NO `import { Pool } from 'pg'` ──────────────────────────────────────
// @prisma/adapter-pg bundles its own pg type definitions internally. Passing a
// `Pool` instance constructed from the top-level `pg` package causes a TypeScript
// structural mismatch between:
//   import("/node_modules/@types/pg/index").Pool
//   import("/node_modules/@prisma/adapter-pg/node_modules/@types/pg/index").Pool
//
// PrismaPg's constructor accepts `pg.Pool | pg.PoolConfig | string`. We use the
// `PoolConfig`-compatible plain object literal form, which avoids class-instance
// identity checking entirely. TypeScript verifies our object structurally against
// whichever PoolConfig the adapter exposes — the shared fields are identical
// across both @types/pg versions (verified: connectionString, max,
// connectionTimeoutMillis, idleTimeoutMillis all match).
//
// ─── CONNECTION ARCHITECTURE ─────────────────────────────────────────────────
//
//   DATABASE_URL (port 6543, Supabase pgbouncer — transaction pooling)
//     └─ PrismaPg({ connectionString, max: 1, ... })  ← manages pool internally
//          └─ PrismaClient({ adapter })
//
//   DIRECT_URL  (port 5432, non-pooled Postgres)
//     └─ consumed only by prisma.config.ts (Prisma CLI: migrate / db push / studio)
//     └─ NEVER imported here — DDL migrations must not traverse pgbouncer
//
// ─── WHY max: 1 ──────────────────────────────────────────────────────────────
// Vercel serverless functions are short-lived, cold-started, and ephemeral.
// There is no benefit in holding multiple idle pg connections per instance —
// the function will be recycled before the pool warms up. Supabase pgbouncer
// multiplexes all concurrent function instances; total Postgres connection
// consumption is controlled at the pgbouncer layer, not here. max:1 prevents
// connection storms during cold-start bursts on high-traffic routes.
//
// ─── WHY SINGLETON ────────────────────────────────────────────────────────────
// Next.js dev mode hot-reloads module graphs on every file save. Without the
// globalThis guard, each hot-reload creates a new PrismaPg pool (and new
// underlying Postgres connections), draining Supabase's free-tier connection
// ceiling within minutes of active development. Storing on globalThis survives
// hot-reloads. Production: globalForPrisma.prisma is never set (Node.js env
// condition), so every cold start creates a fresh instance — correct behaviour.
//
// RUNTIME: Node.js only.
// Never import this in middleware.ts — middleware runs on the Edge runtime, which
// has no native TCP socket and cannot use pg. Middleware derives isPro / planType
// from Clerk sessionClaims only; zero database calls occur in middleware.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import { PrismaPg }    from '@prisma/adapter-pg';

// Augment globalThis to hold the dev-mode singleton without TypeScript errors.
// `unknown as { prisma: PrismaClient | undefined }` is the narrowest safe cast —
// we only ever read and write one well-typed property on this object.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Constructs a PrismaClient backed by a PrismaPg adapter (Prisma v7 required pattern).
 *
 * Called at most once per process lifecycle:
 *   Development: once per hot-reload cycle (then cached on globalThis).
 *   Production:  once per serverless cold start.
 *
 * Throws loudly if DATABASE_URL is absent so the misconfiguration surfaces
 * at startup, not silently at first query.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Precise, actionable error message — surfaces at module load time, not
    // buried in a stack trace 3 s later during the first database query.
    throw new Error(
      '\n' +
      '[lib/db] DATABASE_URL is not set.\n\n' +
      '  This variable is required by @prisma/adapter-pg (Prisma v7).\n' +
      '  It must point to the Supabase pgbouncer endpoint (port 6543).\n\n' +
      '  ┌─ Local development ──────────────────────────────────────────────────┐\n' +
      '  │  Add to .env.local (never commit this file):                         │\n' +
      '  │  DATABASE_URL="postgresql://postgres.[ref]:[pwd]@aws-...:            │\n' +
      '  │               6543/postgres?pgbouncer=true&connection_limit=1"       │\n' +
      '  └──────────────────────────────────────────────────────────────────────┘\n' +
      '  ┌─ Vercel (production / preview) ─────────────────────────────────────┐\n' +
      '  │  Project Settings → Environment Variables → Add DATABASE_URL         │\n' +
      '  │  Scope: Production + Preview + Development                           │\n' +
      '  └──────────────────────────────────────────────────────────────────────┘\n' +
      '  ┌─ GitHub Actions CI ──────────────────────────────────────────────────┐\n' +
      '  │  Repository Settings → Secrets → DATABASE_URL                        │\n' +
      '  │  Workflow env block:  DATABASE_URL: ${{ secrets.DATABASE_URL }}       │\n' +
      '  └──────────────────────────────────────────────────────────────────────┘\n'
    );
  }

  // Pass a PoolConfig-compatible plain object literal to PrismaPg.
  //
  // We intentionally do NOT import Pool from 'pg' and create a Pool instance here.
  // @prisma/adapter-pg bundles its own pg types internally; passing a Pool
  // constructed from the top-level pg package causes a TypeScript structural
  // mismatch between the two @types/pg versions at their Pool class definitions.
  //
  // The PrismaPg constructor accepts `pg.Pool | pg.PoolConfig | string`.
  // A plain object literal is checked structurally against PoolConfig — the
  // fields we use (connectionString, max, connectionTimeoutMillis,
  // idleTimeoutMillis) are identical in both @types/pg versions.
  //
  // PrismaPg manages the pool lifecycle internally when given a PoolConfig.
  const adapter = new PrismaPg({
    connectionString,
    // One pg connection per serverless function instance. See architecture note.
    max: 1,
    // Fail fast on stale / unreachable connections (pg default is 30 s).
    // A function billing 30 s of CPU-wait on a dead connection is unacceptable
    // in a latency-sensitive serverless environment.
    connectionTimeoutMillis: 3_000,
    // Release idle connections promptly so pgbouncer can serve other instances.
    // Serverless functions have no use for idle connections they will never reuse.
    idleTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

export const db: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

// Persist the singleton across hot-reloads in development only.
// In production (NODE_ENV === 'production') this branch is never taken —
// each cold start builds a fresh instance, which is correct for serverless.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
