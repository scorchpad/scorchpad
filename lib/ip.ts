// lib/ip.ts
// ─────────────────────────────────────────────────────────────────────────────
// IP extraction and one-way hashing.
//
// PRIVACY RULE: Raw IP addresses are NEVER stored in Redis keys, Postgres rows,
// or any log output — not even truncated. Only the HMAC-SHA256 hash is ever
// persisted, using IP_HASH_SECRET which is unique to ScorchPad (never shared
// with ZenConvert or any other service).
//
// WHY HMAC INSTEAD OF SHA256: A plain SHA256(ip) is reversible by brute-forcing
// the small IPv4 space (~4B addresses). HMAC with a secret makes inversion
// computationally infeasible even with the hash in hand.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the real client IP from a Next.js request.
 * Vercel sets x-real-ip or x-forwarded-for — prefer x-real-ip (single IP, no chain).
 * Falls back to '127.0.0.1' in local dev where neither header is present.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for is a comma-separated chain; the leftmost is the original client.
    const first = forwarded.split(',')[0];
    return first !== undefined ? first.trim() : '127.0.0.1';
  }

  return '127.0.0.1';
}

/**
 * Returns a one-way HMAC-SHA256 hash of the IP address.
 * The raw IP is never returned — the hash is the only output.
 * Uses Web Crypto API: available in both Edge and Node.js runtimes (Node 16+).
 */
export async function hashIp(ip: string): Promise<string> {
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) {
    throw new Error('IP_HASH_SECRET env var is not set');
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(ip));

  // Hex-encode the 32-byte output for safe use as a DB column or Redis key segment.
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
