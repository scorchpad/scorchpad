import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

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
]);

function addSecurityHeaders(response: NextResponse): NextResponse {
  // ── Content Security Policy ──────────────────────────────────────────────
  // No nonce — Next.js 15 requires deep nonce plumbing we'll add in backend.
  // domain-based allowlist is correct and functional now.
  const csp = [
    "default-src 'self'",
    // Next.js needs unsafe-inline for its own injected scripts + inline event handlers
    // unsafe-eval needed by some Clerk internals
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.razorpay.com https://*.lemonsqueezy.com",
    "frame-ancestors 'none'",
    // Clerk needs WebSocket connect + API endpoints
    "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev wss://*.clerk.accounts.dev https://*.upstash.io https://o4511466116153344.ingest.us.sentry.io",
    // Clerk loads UI components in iframes
    "frame-src https://clerk.scorchpad.rsaatlabs.com https://*.clerk.accounts.dev",
    "worker-src 'self'",
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
  // Removed COEP — credentialless blocks Clerk iframes on some browsers
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  return response;
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  // Add request ID for tracing
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // Protect non-public routes
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return addSecurityHeaders(response);
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
