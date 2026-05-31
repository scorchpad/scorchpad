// prisma.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Prisma 7 configuration — project root.
//
// ─── RESPONSIBILITIES ────────────────────────────────────────────────────────
//   1. Load .env.local so the Prisma CLI can read DIRECT_URL in development.
//   2. Validate required connection variables — fail fast with a clear message
//      rather than a cryptic Prisma "Can't reach database server" panic.
//   3. Expose the datasource config (DIRECT_URL) for the CLI tools:
//        npx prisma migrate dev
//        npx prisma migrate deploy
//        npx prisma db push
//        npx prisma studio
//
// ─── WHY process.loadEnvFile() ───────────────────────────────────────────────
//   • Built into Node ≥ 20.12 — zero extra dependencies, no dotenv package.
//   • Now correctly typed in @types/node ≥ 22.0.0 (previously only available
//     at runtime; @types/node@20.0.0 didn't declare it → the build error
//     you just fixed by bumping the dep).
//   • Next.js automatically loads .env.local at dev-server / build time, so
//     this call only matters when the Prisma CLI runs standalone.
//   • The try/catch silently skips loading when the file doesn't exist — the
//     expected state in CI (secrets injected by the runner) and production
//     (Vercel env vars set in project settings).
//
// ─── WHY TWO DATABASE URLs ───────────────────────────────────────────────────
//   DIRECT_URL  (Supabase port 5432, no pgbouncer) → this file / migrations.
//     DDL statements (CREATE TABLE, ALTER TABLE, etc.) require a persistent,
//     long-lived connection. pgbouncer's transaction-pooling mode closes the
//     underlying Postgres connection between client transactions, which breaks
//     multi-statement DDL migrations that expect a single continuous session.
//
//   DATABASE_URL (Supabase port 6543, through pgbouncer) → lib/db.ts / runtime.
//     Serverless functions spin up on cold starts; connection-pooling through
//     pgbouncer prevents thousands of simultaneous Postgres connections from
//     exhausting Supabase's pg_max_connections ceiling.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from 'prisma/config';

// ── 1. Load .env.local for CLI invocations ────────────────────────────────────
//
// process.loadEnvFile() is Node 20.12+ and now correctly typed in
// @types/node ≥ 22 — no type cast required.
//
// The try/catch is intentional: .env.local is absent in CI and production.
// Throwing here would break every `npx prisma migrate deploy` in those
// environments. We surface a better error in the validation step below.
try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local not present — normal in CI (GitHub Actions / Vercel build).
  // Environment variables are injected directly by the platform in those
  // contexts; no file loading required.
}

// ── 2. Validate required environment variables ────────────────────────────────
//
// Fail loudly here rather than letting Prisma throw a generic connection error
// ten seconds later. A precise message saves significant debugging time.
//
// CI environments inject DIRECT_URL via secrets (no file needed).
// Production environments (Vercel) set it in project env var settings.
// Development must have it in .env.local — the load above covers that.
const directUrl = process.env.DIRECT_URL;
const isCI      = Boolean(process.env.CI);       // GitHub Actions, Vercel build
const isTest    = process.env.NODE_ENV === 'test'; // Vitest — no DB needed

if (!directUrl && !isCI && !isTest) {
  throw new Error(
    '\n' +
    '[prisma.config] ✖  DIRECT_URL is not set.\n\n' +
    '  This variable is required by the Prisma CLI for migrations.\n' +
    '  It must point to the non-pooled Supabase connection (port 5432).\n\n' +
    '  ┌─ Local development ──────────────────────────────────────────────┐\n' +
    '  │  Add to .env.local:                                              │\n' +
    '  │  DIRECT_URL="postgresql://postgres:[pwd]@db.[ref].supabase.co:  │\n' +
    '  │              5432/postgres"                                      │\n' +
    '  └──────────────────────────────────────────────────────────────────┘\n' +
    '  ┌─ CI (GitHub Actions) ────────────────────────────────────────────┐\n' +
    '  │  Add DIRECT_URL as a repository secret and map it in your        │\n' +
    '  │  workflow env block:                                              │\n' +
    '  │  env:                                                             │\n' +
    '  │    DIRECT_URL: ${{ secrets.DIRECT_URL }}                         │\n' +
    '  └──────────────────────────────────────────────────────────────────┘\n' +
    '  ┌─ Production (Vercel) ────────────────────────────────────────────┐\n' +
    '  │  Project Settings → Environment Variables → Add DIRECT_URL       │\n' +
    '  └──────────────────────────────────────────────────────────────────┘\n'
  );
}

// ── 3. Prisma configuration ───────────────────────────────────────────────────
export default defineConfig({
  // Explicit schema path — prevents ambiguity on Windows path separators
  // and makes `prisma studio` find the schema without a --schema flag.
  schema: 'prisma/schema.prisma',

  datasource: {
    // Non-pooled connection for the Prisma CLI.
    // In CI, DIRECT_URL is injected by the runner after the try/catch above;
    // the empty string fallback is never reached in a correctly configured env.
    url: directUrl ?? '',
  },
});
