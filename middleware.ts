// middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clerk authentication + security headers for every request.
//
// SECURITY FIXES (this version):
//
//   FIX #2 — Nonce-based Content Security Policy (retained from prior version).
//
//   FIX H3 — Sentry DSN exposure (this version):
//     OLD: CSP connect-src included direct Sentry ingest URLs:
//            https://*.sentry.io
//            https://*.ingest.sentry.io
//            https://o4511466116153344.ingest.us.sentry.io
//          The specific org-keyed URL (o4511466116153344…) was visible in every
//          HTTP response header. An attacker reading the CSP could identify the
//          Sentry project and directly flood the ingest endpoint, exhausting
//          event quota and blinding the team. The meta-baggage and baggage
//          response headers also leaked the sentry-public_key and sentry-org_id
//          to any HTTP observer (including browser devtools, proxies, CDN logs).
//
//     NEW:  All Sentry events are tunnelled through /monitoring (same-origin).
//          instrumentation-client.ts sets tunnelRoute: '/monitoring'. The
//          browser never connects to *.ingest.sentry.io directly. Consequently:
//            1. All three direct Sentry ingest entries removed from connect-src.
//               The tunnel is same-origin and covered by 'self'.
//            2. baggage and sentry-trace response headers stripped in
//               addSecurityHeaders() before sending to the client. These headers
//               are added by Sentry's Next.js SDK for distributed tracing; they
//               contain the public_key and org_id. Stripping them from responses
//               means no HTTP observer can derive Sentry credentials from normal
//               page loads. Sentry's server-to-server tracing is unaffected
//               because these headers on *requests* (inbound propagation) are
//               not touched.
//
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { deriveTierFromClaims } from './lib/plan-limits';

// ── Public routes: no authentication required ─────────────────────────────────
const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/about',
  '/privacy',
  '/terms',
  '/warrant-canary',
  '/security',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/p/(.*)',
  '/api/paste/(.*)',
  '/api/csp-report',
  '/api/webhooks/(.*)',
  '/api/health',
  '/api/user/subscription',
  '/api/user/action-check',
  '/pgp-key.txt',
  '/robots.txt',
  '/warrant-canary.txt',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/.well-known/(.*)',
  '/favicon.svg',
  '/favicon.ico',
]);

// ── Private key path guard ─────────────────────────────────────────────────────
function isPrivateKeyPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes('private') ||
    lower.includes('private-key') ||
    lower === '/private-key-keep-secret.txt' ||
    lower === '/private-key-keep-secret'
  );
}

// ── Nonce generation ──────────────────────────────────────────────────────────
function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

// ── Security headers ──────────────────────────────────────────────────────────
function addSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  // FIX #2: Nonce-based CSP — 'unsafe-inline' removed from script-src.
  //
  // FIX H3: Direct Sentry ingest URLs removed from connect-src.
  //   OLD connect-src included:
  //     https://*.sentry.io
  //     https://*.ingest.sentry.io
  //     https://o4511466116153344.ingest.us.sentry.io
  //   All three are gone. Sentry events now flow through /monitoring (same-origin,
  //   covered by 'self'). No browser request ever goes directly to Sentry's CDN.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.razorpay.com https://*.lemonsqueezy.com",
    "frame-ancestors 'none'",
    // FIX H3: connect-src no longer includes any direct Sentry ingest endpoint.
    // All Sentry traffic is tunnelled through /monitoring (same-origin = 'self').
    "connect-src 'self' https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev wss://*.clerk.accounts.dev https://*.upstash.io https://challenges.cloudflare.com",
    "frame-src https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // FIX H3: Strip Sentry distributed-tracing headers from responses.
  // Sentry's Next.js SDK adds `sentry-trace` and `baggage` to HTTP responses
  // as part of its OpenTelemetry trace context propagation. The `baggage` header
  // contains sentry-public_key and sentry-org_id in plaintext, visible to any
  // HTTP observer (browser devtools, CDN access logs, proxies, network monitors).
  // Removing them from responses prevents credential enumeration without
  // affecting server-side distributed tracing (inbound propagation on requests
  // is not touched).
  response.headers.delete('baggage');
  response.headers.delete('sentry-trace');

  return response;
}

// ── Main middleware ────────────────────────────────────────────────────────────
export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // ── 1. Hard block private key paths ───────────────────────────────────────
  if (isPrivateKeyPath(pathname)) {
    return new NextResponse(
      'Forbidden. Private keys must not be placed in the /public directory.',
      {
        status: 403,
        headers: {
          'Content-Type':  'text/plain',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // ── 2. Generate per-request nonce ─────────────────────────────────────────
  const nonce = generateNonce();

  const requestHeaders = new Headers(request.headers);

  // ── 3. Request ID for distributed tracing ─────────────────────────────────
  const requestId = crypto.randomUUID();
  requestHeaders.set('x-request-id', requestId);

  // FIX #2: Pass nonce to layout.tsx via request header.
  requestHeaders.set('x-nonce', nonce);

  // ── 4. Route protection ───────────────────────────────────────────────────
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // ── 5. Tier derivation from sessionClaims — zero DB calls ─────────────────
  const { userId, sessionClaims } = await auth();
  const tierInfo = deriveTierFromClaims(
    userId ?? null,
    sessionClaims as Record<string, unknown> | null
  );

  requestHeaders.set('x-user-tier',  tierInfo.tier);
  requestHeaders.set('x-plan-type',  tierInfo.planType       ?? '');
  requestHeaders.set('x-period-end', tierInfo.currentPeriodEnd ?? '');

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ── 6. Apply security headers with nonce ──────────────────────────────────
  return addSecurityHeaders(response, nonce);
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
