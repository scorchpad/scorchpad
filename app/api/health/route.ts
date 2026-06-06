// app/api/health/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health
// Liveness probe for Vercel uptime monitoring and CI smoke tests.
// Returns 200 if all dependencies are healthy, 503 if any are down.
//
// SECURITY FIXES (this version):
//
//   FIX #6a — Rate limiting added:
//     This endpoint was completely unrated and publicly accessible.
//     An attacker used it to monitor infrastructure state in real time:
//       - Polling during an attack to know when Redis/DB were degraded.
//       - Timing latencyMs to infer the deployment region.
//       - Watching for 503 to know when a DoS was working and when infra recovered.
//     Now rate-limited to 30 req/min per IP — generous for uptime monitors
//     (which poll every 30–60 s) while blocking attack-time surveillance.
//
//   FIX #6b — Reduced information disclosure:
//     OLD response: { status, latencyMs, checks: { redis: 'ok'|'fail', db: 'ok'|'fail' } }
//       - latencyMs revealed deployment region fingerprint.
//       - Per-component checks told an attacker exactly which dependency was
//         down during a targeted attack (so they could know their Redis exhaustion
//         attack was working vs. their DB flood).
//     NEW response: { status: 'ok'|'degraded' } only.
//       - Uptime monitors only need the status code (200 vs 503); the body is
//         for human operators viewing Vercel logs.
//       - Per-component details are still logged server-side for debugging but
//         are NOT returned in the HTTP response body.
//
// RUNTIME: Node.js — pings Prisma (requires Node.js).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

import { redis } from '../../../lib/redis';
import { db }    from '../../../lib/db';
import { getClientIp, hashIp } from '../../../lib/ip';
import { healthLimit } from '../../../lib/ratelimit';

export async function GET(request: Request): Promise<Response> {
  // ── FIX #6a: Rate limit — 30/min per IP ───────────────────────────────────
  const rawIp = getClientIp(request);
  const ipHash = await hashIp(rawIp);

  const { success, reset } = await healthLimit.limit(ipHash);
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return Response.json(
      { status: 'rate_limited' },
      {
        status: 429,
        headers: {
          'Retry-After':   String(retryAfter),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // ── Dependency health checks ───────────────────────────────────────────────
  const [redisOk, dbOk] = await Promise.all([
    redis.ping()
      .then((r) => r === 'PONG')
      .catch(() => false),
    db.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
  ]);

  const allOk = redisOk && dbOk;

  // ── FIX #6b: Log per-component details server-side only ───────────────────
  // NOT returned in HTTP response — prevents attack-time surveillance.
  if (!allOk) {
    console.error('[scorchpad/health] Dependency failure:', {
      redis: redisOk ? 'ok' : 'fail',
      db:    dbOk    ? 'ok' : 'fail',
    });
  }

  // ── Minimal public response — status only ─────────────────────────────────
  // Uptime monitors only need 200 vs 503. No latency, no component breakdown.
  return Response.json(
    { status: allOk ? 'ok' : 'degraded' },
    {
      status: allOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
