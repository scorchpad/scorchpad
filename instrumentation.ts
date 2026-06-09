// instrumentation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Next.js instrumentation file — loaded ONCE when the server process starts.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// ─── WHY THIS FILE REPLACES sentry.server.config.ts + sentry.edge.config.ts ─
//
//   @sentry/nextjs ≥ 9 requires Sentry.init() to be called inside the
//   register() export of a Next.js instrumentation file. Calling it from the
//   legacy sentry.*.config.ts files still partially works, but:
//     • Generates DEPRECATION WARNINGs on every build (visible in your logs).
//     • Will break outright when @sentry/nextjs drops support in a future major.
//     • Causes the SDK to miss some lifecycle hooks it can only attach during
//       the instrumentation phase (e.g. React Server Component error capture).
//
// ─── RUNTIME GUARD ───────────────────────────────────────────────────────────
//
//   Next.js sets NEXT_RUNTIME to:
//     'nodejs' → Node.js server runtime (API routes, Server Components, etc.)
//     'edge'   → Edge runtime (middleware, edge API routes)
//
//   Both run on the server — neither is the browser. We guard each Sentry.init()
//   behind the correct runtime string to avoid double-initialisation and to let
//   the SDK apply runtime-appropriate internal instrumentation.
//
// ─── onRequestError ──────────────────────────────────────────────────────────
//
//   Exported alongside register(), onRequestError is called by Next.js for
//   every unhandled error during a request — including errors thrown inside
//   React Server Components and Server Actions, which don't propagate to the
//   standard Node.js unhandledRejection event that Sentry would otherwise use.
//
// ─── SECURITY ────────────────────────────────────────────────────────────────
//
//   scrubFragmentFromEvent() is registered as beforeSend in both the nodejs
//   and edge init calls. See src/lib/sentry.ts for the full security rationale.
//
//   FIX H3 (complete) — Sentry baggage header propagation via SSR responses:
//     middleware.ts strips `baggage` and `sentry-trace` from NextResponse
//     objects, but the Sentry SDK can also inject these headers during the
//     server-side rendering pipeline — AFTER middleware has already run. The
//     middleware deletion therefore does not reach headers added at render time.
//     Setting tracePropagationTargets: [] below disables all outgoing trace
//     context propagation at the SDK level, which prevents the SDK from
//     injecting sentry-public_key and sentry-org_id into any server response
//     headers. The middleware deletion in middleware.ts is retained as a
//     belt-and-suspenders layer for any edge cases.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from '@sentry/nextjs';
import { scrubFragmentFromEvent } from './src/lib/sentry';

export function register(): void {
  const dsn     = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const runtime = process.env.NEXT_RUNTIME;

  // Common init options shared between both server runtimes.
  // Extracted here to keep the two Sentry.init() calls DRY.
  const commonOptions = {
    dsn,
    environment:      process.env.NODE_ENV ?? 'development',
    release:          process.env.SENTRY_RELEASE, // injected by withSentryConfig

    // Sample 10% of traces in production; capture everything in dev so you
    // can see full traces locally without sampling gaps.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // FIX H3 (complete): Disable all outgoing trace context propagation.
    //
    // The Sentry SDK uses tracePropagationTargets to decide which outgoing
    // requests (and, in Next.js SSR, which server responses) should have
    // `sentry-trace` and `baggage` headers injected for distributed tracing.
    // An empty array disables propagation entirely, preventing the SDK from
    // emitting sentry-public_key and sentry-org_id into any HTTP header.
    //
    // middleware.ts also strips these from NextResponse objects, but that
    // deletion runs before SSR — headers Sentry adds during rendering are
    // not covered by it. This SDK-level disable closes that gap.
    //
    // Tradeoff: server→server distributed traces will not propagate Sentry
    // context. Acceptable: ScorchPad has no external backend services to
    // propagate to, and all frontend tracing originates from the client SDK.
    tracePropagationTargets: [] as string[],

    // SECURITY: strip decryption keys from every captured event.
    // See src/lib/sentry.ts for the full explanation.
    beforeSend: scrubFragmentFromEvent,

    // Suppress verbose Sentry internal debug output in production bundles.
    // Handled at the webpack bundle level via next.config.ts
    // (webpack.treeshake.removeDebugLogging), but setting this false at
    // runtime as well is belt-and-suspenders.
    debug: process.env.NODE_ENV !== 'production',
  } as const;

  // ── Node.js server runtime ─────────────────────────────────────────────────
  // Handles: App Router pages, Route Handlers, Server Actions, middleware
  // running on the Node.js adapter.
  //
  // ── NOTE: autoSessionTracking removed in @sentry/nextjs v8+ ─────────────
  //
  // `autoSessionTracking` existed in Sentry v7 and was dropped entirely in
  // v8. It is absent from NodeOptions in your installed version (v10), so
  // TypeScript correctly rejects it as an unknown property.
  //
  // What replaced it: Sentry v8+ tracks server health automatically via the
  // spans / traces pipeline. Unhandled rejections and uncaught exceptions are
  // captured by the SDK's built-in Node.js integrations
  // (onUncaughtExceptionIntegration, onUnhandledRejectionIntegration), which
  // are active by default — no explicit option required.
  //
  // Migration reference:
  //   https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/
  // ─────────────────────────────────────────────────────────────────────────
  if (runtime === 'nodejs') {
    Sentry.init({
      ...commonOptions,
    });
  }

  // ── Edge runtime ───────────────────────────────────────────────────────────
  // Handles: middleware, Edge API routes, and any route segment that opts in
  // to the Edge runtime via `export const runtime = 'edge'`.
  //
  // Note: some Node.js SDK features (e.g. profiling, certain integrations) are
  // not available in the Edge runtime — the SDK handles this automatically.
  if (runtime === 'edge') {
    Sentry.init({
      ...commonOptions,
    });
  }
}

// Capture errors from React Server Components and Server Actions.
// Without this export, RSC errors are swallowed by Next.js and never reach
// the standard Node.js unhandledRejection hook that Sentry normally listens to.
export const onRequestError = Sentry.captureRequestError;
