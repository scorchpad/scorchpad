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
// SECURITY FIX (C1 — cf-connecting-ip spoofing):
//   OLD (vulnerable):
//     The server unconditionally trusted cf-connecting-ip as the first-priority
//     header. Cloudflare sets this legitimately, but every Vercel project has a
//     stable *.vercel.app origin URL discoverable via crt.sh or DNS history.
//     An attacker who hits Vercel directly (bypassing Cloudflare) can inject any
//     cf-connecting-ip value they like — Vercel has no reason to strip it.
//     Consequence: ALL IP-based rate limits (paste creation, read, password
//     brute-force) collapse to zero, because the attacker cycles spoofed IPs.
//
//   NEW (fixed):
//     Before trusting cf-connecting-ip, we validate that the actual connecting
//     network address (from x-real-ip, which Vercel sets and the user cannot
//     spoof) falls within Cloudflare's published IP ranges. If it does, the
//     request genuinely arrived through Cloudflare's edge, so cf-connecting-ip
//     is authentic. If it does not, the request bypassed Cloudflare — we fall
//     through to x-real-ip (the real connecting address from Vercel's
//     perspective) instead of trusting the spoofed header.
//
//   CLOUDFLARE IP RANGES: Published at https://www.cloudflare.com/ips/
//     These change rarely. Update when Cloudflare announces new ranges.
//     The correct, long-term fix is Cloudflare Authenticated Origin Pulls
//     (mTLS client cert on the Vercel origin), which enforces this at the TLS
//     layer instead of the application layer. This code is a defence-in-depth
//     layer while AOP is being configured.
//
// Header priority (most-specific to least-specific):
//   1. cf-connecting-ip  — real visitor IP set by Cloudflare (only trusted when
//                          x-real-ip confirms request came from Cloudflare range)
//   2. x-real-ip         — set by Vercel edge (cannot be spoofed by the user;
//                          reflects the true connecting TCP peer)
//   3. x-forwarded-for   — leftmost entry is the original client
//   4. 127.0.0.1         — local dev fallback (no headers present)
// ─────────────────────────────────────────────────────────────────────────────

// ── Cloudflare published IPv4 ranges ─────────────────────────────────────────
// Source: https://www.cloudflare.com/ips-v4/
// Last verified: 2025-01. Update when Cloudflare publishes new ranges.
const CLOUDFLARE_IPV4_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
] as const;

// ── CIDR helpers ──────────────────────────────────────────────────────────────

/**
 * Converts a dotted-decimal IPv4 string to an unsigned 32-bit integer.
 * Returns -1 if the input is not a valid IPv4 address.
 */
function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return -1;
  let result = 0;
  for (const part of parts) {
    const byte = parseInt(part, 10);
    if (isNaN(byte) || byte < 0 || byte > 255 || part.trim() !== String(byte)) return -1;
    result = ((result << 8) | byte) >>> 0;
  }
  return result;
}

/**
 * Returns true if `ip` falls within the given CIDR block.
 * IPv6 addresses always return false (Cloudflare IPv6 ranges are separate
 * and rarely appear on Vercel's x-real-ip).
 */
function isInCidr(ip: string, cidr: string): boolean {
  if (ip.includes(':')) return false; // Skip IPv6
  const slashIdx = cidr.lastIndexOf('/');
  if (slashIdx === -1) return ip === cidr;
  const network   = cidr.slice(0, slashIdx);
  const prefixLen = parseInt(cidr.slice(slashIdx + 1), 10);
  if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;
  const ipNum      = ipv4ToUint32(ip);
  const networkNum = ipv4ToUint32(network);
  if (ipNum < 0 || networkNum < 0) return false;
  const mask = prefixLen === 0 ? 0 : ((0xFFFFFFFF << (32 - prefixLen)) >>> 0);
  return (ipNum & mask) === (networkNum & mask);
}

/**
 * Returns true if the given IP is within Cloudflare's published address space.
 * This is used to gate whether cf-connecting-ip can be trusted.
 */
function isCloudflareIp(ip: string): boolean {
  if (!ip || ip.includes(':')) return false; // Fast-path: ignore IPv6, empty
  return CLOUDFLARE_IPV4_CIDRS.some((cidr) => isInCidr(ip, cidr));
}

/**
 * Extracts the real client IP from a Next.js request, with full awareness of
 * the Cloudflare → Vercel proxy architecture used by scorchpad.rsaatlabs.com.
 *
 * SECURITY: cf-connecting-ip is only trusted when the actual network peer
 * (from x-real-ip) is confirmed to be a Cloudflare IP. This prevents attackers
 * who discover the raw Vercel origin URL from spoofing arbitrary client IPs
 * by injecting a cf-connecting-ip header.
 *
 * Falls back to '127.0.0.1' only in local dev where no IP headers are present.
 */
export function getClientIp(request: Request): string {
  // x-real-ip is set by Vercel's edge infrastructure and reflects the actual
  // TCP-level connecting address (i.e. the Cloudflare edge node, if CF proxy is
  // active, or the end user's IP if hitting Vercel directly). The user cannot
  // spoof this header — Vercel always overwrites it with the real peer address.
  const realIp = request.headers.get('x-real-ip')?.trim() ?? '';

  // Priority 1 — cf-connecting-ip (Cloudflare proxy mode ON):
  //   Trusted ONLY when x-real-ip confirms the request came from Cloudflare.
  //   If realIp is a Cloudflare edge address, cf-connecting-ip contains the
  //   original visitor IP set by Cloudflare — authoritative and spoofed-resistant
  //   in this path.
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp && realIp && isCloudflareIp(realIp)) {
    return cfIp;
  }

  // Priority 2 — x-real-ip (direct connection to Vercel, no CF proxy):
  //   The request bypassed Cloudflare (or CF proxy is off). x-real-ip IS the
  //   real client — use it directly instead of the unvalidated cf-connecting-ip.
  if (realIp) return realIp;

  // Priority 3 — x-forwarded-for (standard forwarded-for chain):
  //   Comma-separated list; leftmost entry is the original client.
  //   More easily spoofable than the above — last resort only.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
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
