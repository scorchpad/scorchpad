// middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clerk authentication + security headers for every request.
//
// SECURITY FIXES applied here:
//
//   1. Public static assets (pgp-key.txt, robots.txt, warrant-canary.txt,
//      sitemap.xml) are now explicitly whitelisted as public routes so they
//      are accessible without authentication. Previously /pgp-key.txt was
//      protected, causing the "Sign In (Mock)" redirect on the warrant canary
//      PGP link.
//
//   2. PRIVATE-KEY-KEEP-SECRET.txt guard: any path that matches the private
//      key filename returns an explicit 403 BEFORE auth runs. Defence-in-depth
//      — the real fix is to delete that file from /public and add it to
//      .gitignore. Never commit private keys.
//
//   3. All existing security headers preserved unchanged.
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
  // ── User API routes that handle anonymous access internally ───────────────
  // These routes check auth() themselves and return tier-appropriate data for
  // unauthenticated callers. They MUST be public here or Clerk v7 returns 404
  // before the route handler runs — anonymous users can never get their limits.
  '/api/user/subscription',
  '/api/user/action-check',
  // ── Static public files in /public ───────────────────────────────────────
  // Next.js middleware runs BEFORE the static file server, so we must
  // explicitly list these or unauthenticated requests get redirected to /sign-in.
  '/pgp-key.txt',
  '/robots.txt',
  '/warrant-canary.txt',   // raw signed canary text (verifiable offline)
  '/sitemap.xml',
  '/.well-known/(.*)',
  '/favicon.svg',
  '/favicon.ico',
]);

// ── Private key path guard ─────────────────────────────────────────────────────
// Defence-in-depth: if the PRIVATE key file was accidentally committed to /public,
// block it at the edge before Clerk even runs. A 403 prevents exposure even to
// authenticated users.
// THE REAL FIX: delete the file from /public and add it to .gitignore.
function isPrivateKeyPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes('private') ||
    lower.includes('private-key') ||
    lower === '/private-key-keep-secret.txt' ||
    lower === '/private-key-keep-secret'
  );
}

// ── Security headers ──────────────────────────────────────────────────────────
function addSecurityHeaders(response: NextResponse): NextResponse {
  const csp = [
    "default-src 'self'",
    // FIX: Added https://challenges.cloudflare.com to script-src, frame-src, connect-src.
    // Clerk uses Cloudflare Turnstile for bot protection on every sign-in/sign-up page.
    // Turnstile loads an iframe + scripts from challenges.cloudflare.com.
    // Without this, browser blocks those resources → "The CAPTCHA failed to load".
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.razorpay.com https://*.lemonsqueezy.com",
    "frame-ancestors 'none'",
    "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev wss://*.clerk.accounts.dev https://*.upstash.io https://o4511466116153344.ingest.us.sentry.io https://challenges.cloudflare.com",
    "frame-src https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
    // blob: is required for Clerk v7 — it spawns Web Workers from blob: URLs for
    // token refresh and session management. Without blob: every page load produces
    // 3–6 CSP violations and Clerk's background workers are silently terminated,
    // which causes stale auth state and broken session refresh.
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

  return response;
}

// ── Main middleware ────────────────────────────────────────────────────────────
export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // ── 1. Hard block private key paths — 403, no redirect, no leakage ────────
  if (isPrivateKeyPath(pathname)) {
    return new NextResponse(
      'Forbidden. Private keys must not be placed in the /public directory.',
      {
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // ── 2. Request ID for distributed tracing ─────────────────────────────────
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // ── 3. Route protection ───────────────────────────────────────────────────
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // ── 4. Tier derivation from sessionClaims — zero DB calls ─────────────────
  const { userId, sessionClaims } = await auth();
  const tierInfo = deriveTierFromClaims(
    userId ?? null,
    sessionClaims as Record<string, unknown> | null
  );

  requestHeaders.set('x-user-tier',  tierInfo.tier);
  requestHeaders.set('x-plan-type',  tierInfo.planType   ?? '');
  requestHeaders.set('x-period-end', tierInfo.currentPeriodEnd ?? '');

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return addSecurityHeaders(response);
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
