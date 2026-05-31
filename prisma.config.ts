// prisma.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Prisma 7 configuration file — project root.
//
// WHY THIS FILE EXISTS:
// Prisma 7 removed url/directUrl from schema.prisma. The CLI (migrate deploy,
// migrate dev, db push) reads connection config from here instead.
//
// WHY process.loadEnvFile():
// The Prisma CLI runs outside Next.js — it does NOT load .env.local
// automatically. Next.js handles that during dev/build, but bare CLI calls
// (npx prisma migrate deploy) see no env vars unless we load them here.
// process.loadEnvFile() is built into Node.js 20.12+ — no dotenv package needed.
// The try/catch means CI works too (env vars injected directly there, no file).
//
// TWO URLS, TWO PURPOSES:
//   DIRECT_URL  (port 5432, no pgbouncer) → used here for migrations.
//               DDL statements need a persistent connection. pgbouncer's
//               transaction mode drops connections between statements and
//               breaks multi-statement DDL migrations.
//
//   DATABASE_URL (port 6543, pgbouncer)   → used in lib/db.ts for runtime.
//               Serverless functions benefit from connection pooling so
//               Supabase's connection limit isn't exhausted on cold starts.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from 'prisma/config';

// Load .env.local so DIRECT_URL is available to the Prisma CLI.
// Gracefully skipped in CI where env vars are injected directly.
try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local not present — expected in CI and production environments
}

export default defineConfig({
  // Explicit schema path — avoids ambiguity on Windows path separators.
  schema: 'prisma/schema.prisma',

  datasource: {
    // DIRECT_URL: non-pooled Supabase connection (port 5432).
    // Required for migrate deploy — pgbouncer is incompatible with DDL.
    url: process.env.DIRECT_URL ?? '',
  },
});
