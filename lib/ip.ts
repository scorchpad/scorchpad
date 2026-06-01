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
//
// ─── CLOUDFLARE PROXY ARCHITECTURE ──────────────────────────────────────────
// scorchpad.rsaatlabs.com uses Cloudflare with proxy mode ON (orange cloud).
// Traffic flow: User → Cloudflare edge → Vercel serverless function.
//
// Problem with the old code (x-real-ip first):
//   Vercel sees the Cloudflare edge node as the "client". The x-real-ip header
//   Vercel sets is the Cloudflare edge IP — shared by every user routed through
//   that edge node. All anonymous users collapse into a single rate-limit bucket,
//   so 3 test pastes from one machine lock out every anonymous user globally for
//   24 hours.
//
// Solution (cf-connecting-ip first):
//   Cloudflare always sets cf-connecting-ip to the original visitor IP before
//   forwarding the request to the origin (Vercel). This header is injected by
//   Cloudflare's edge and cannot be spoofed by the end user when Cloudflare
//   proxy is active. Prioritising it gives us the correct per-user IP for
//   rate-limit keying.
//
// Header priority (most-specific to least-specific):
//   1. cf-connecting-ip  — real visitor IP set by Cloudflare (most reliable)
//   2. x-real-ip         — set by Vercel edge when NOT behind a CDN proxy
//   3. x-forwarded-for   — leftmost entry is the original client
//   4. 127.0.0.1         — local dev fallback (no headers present)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the real client IP from a Next.js request, with full awareness of
 * the Cloudflare → Vercel proxy architecture used by scorchpad.rsaatlabs.com.
 *
 * Falls back to '127.0.0.1' only in local dev where no IP headers are present.
 */
export function getClientIp(request: Request): string {
  // Priority 1 — cf-connecting-ip (Cloudflare proxy mode ON):
  //   Cloudflare sets this to the original visitor IP before forwarding to Vercel.
  //   This is the authoritative source when traffic flows through Cloudflare proxy.
  //   Without this check, all users behind the same Cloudflare PoP share one IP.
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // Priority 2 — x-real-ip (Vercel edge, no CDN proxy):
  //   Present when Vercel terminates the connection directly (no Cloudflare proxy).
  //   Contains a single IP — no parsing required.
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // Priority 3 — x-forwarded-for (standard forwarded-for chain):
  //   Comma-separated list; leftmost entry is the original client.
  //   Used as a last resort — more easily spoofable than the headers above.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    return first !== undefined ? first.trim() : '127.0.0.1';
  }

  // Priority 4 — local dev fallback.
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
