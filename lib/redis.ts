// lib/redis.ts
// ─────────────────────────────────────────────────────────────────────────────
// Upstash Redis client — compatible with both Edge and Node.js runtimes.
//
// WHY UPSTASH: Standard Redis clients open TCP connections that don't work in
// Edge runtime (Vercel middleware). Upstash's REST-based client works everywhere.
//
// KEY NAMESPACE: All ScorchPad keys are prefixed `pv:` so this Redis instance
// can be safely shared with ZenConvert without key collisions.
//
// KEY PATTERNS (set in routes, documented here for a single source of truth):
//   pv:paste:{id}   → JSON RedisPasteRecord          TTL: expirySeconds
//   pv:views:{id}   → integer view counter            TTL: expirySeconds
//   rl:pv:*         → rate limiter windows             TTL: window duration
// ─────────────────────────────────────────────────────────────────────────────

import { Redis } from '@upstash/redis';

// fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN automatically.
export const redis = Redis.fromEnv();
