// app/api/health/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health
// Liveness probe for Vercel uptime monitoring and CI smoke tests.
// Returns 200 with component status map, or 503 if any dependency is down.
//
// RUNTIME: Node.js — pings Prisma (requires Node.js).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { redis } from '../../../lib/redis';
import { db }    from '../../../lib/db';

export async function GET(): Promise<Response> {
  const start = Date.now();

  const [redisOk, dbOk] = await Promise.all([
    redis.ping()
      .then((r) => r === 'PONG')
      .catch(() => false),
    db.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
  ]);

  const latencyMs = Date.now() - start;
  const allOk = redisOk && dbOk;

  return Response.json(
    {
      status:    allOk ? 'ok' : 'degraded',
      latencyMs,
      checks: {
        redis: redisOk ? 'ok' : 'fail',
        db:    dbOk    ? 'ok' : 'fail',
      },
    },
    { status: allOk ? 200 : 503 }
  );
}
