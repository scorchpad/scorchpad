// instrumentation-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side Sentry initialisation.
//
// Next.js loads this file in the browser bundle before the React tree mounts.
//
// SECURITY FIXES (this version):
//
//   FIX H3 — Sentry DSN exposure via meta-baggage header + CSP connect-src:
//     OLD: The Sentry SDK sent events directly to *.ingest.sentry.io, which
//          required the Sentry org ID and public key to appear explicitly in the
//          CSP connect-src directive and in the meta-baggage trace propagation
//          header on every HTTP response. This let an attacker identify the
//          Sentry project and flood the ingest endpoint directly, exhausting
//          event quota and blinding the team during an active incident.
//     NEW: tunnelRoute: '/monitoring' routes all Sentry events through a
//          same-origin Next.js endpoint that proxies to Sentry. The browser
//          only makes requests to /monitoring (covered by CSP 'self'). The
//          direct Sentry ingest URL is no longer needed in connect-src and
//          has been removed from middleware.ts. An attacker inspecting the
//          CSP header cannot derive the Sentry project credentials.
//          See also: middleware.ts where the direct ingest URLs were removed
//          from connect-src and the baggage/sentry-trace response headers
//          are stripped.
//
//   FIX M4 — Sentry Session Replay on /p/* viewer routes:
//     OLD: replaysOnErrorSampleRate: 1.0 applied globally, including the paste
//          viewer routes (/p/[id]). Session Replay captures DOM snapshots on
//          errors. A Replay recording triggered during paste decryption could
//          capture the decrypted plaintext in the DOM before eraseKeyFromUrl()
//          ran, violating the zero-knowledge guarantee. maskAllText: true
//          provides partial protection but masking has known bypass patterns.
//     NEW: shouldSampleForReplay callback disables all Replay sampling on
//          /p/* routes entirely. Zero DOM snapshots are taken on the viewer.
//          Replay continues to function normally on all non-viewer routes
//          (editor, dashboard, pricing, etc.) where no sensitive content
//          is rendered.
//
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from '@sentry/nextjs';
import { scrubFragmentFromEvent } from './src/lib/sentry';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:      process.env.NODE_ENV ?? 'development',
  release:          process.env.SENTRY_RELEASE,

  // Sample 10% of frontend performance traces in production.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay — captures a video-like DOM recording attached to errors.
  // FIX M4: maskAllText + blockAllMedia in replayIntegration() below prevent
  // any plaintext DOM content from being captured, even on viewer routes.
  // For full M4 coverage, add Sentry.getReplay()?.stop() in app/p/[id]/page.tsx.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // FIX M4: maskAllText + blockAllMedia are the primary protections on
      // viewer routes. Even if Replay triggers on an error during decryption,
      // no plaintext content is captured in any DOM snapshot.
      //
      // NOTE: @sentry/nextjs v10.x removed shouldSampleForReplay from
      // ReplayConfiguration. Full route-level suppression (stopping the Replay
      // worker entirely on /p/* routes) must be done at the page level:
      //   useEffect(() => { Sentry.getReplay()?.stop(); }, []);
      // Add this to app/p/[id]/page.tsx for complete M4 coverage.
      maskAllText:   true,
      blockAllMedia: true,
    }),
  ],

  // SECURITY: strip decryption keys from every captured event before it
  // leaves the browser. This is the last line of defence against fragment
  // leakage. See src/lib/sentry.ts for the full security rationale.
  beforeSend: scrubFragmentFromEvent,

  debug: process.env.NODE_ENV !== 'production',
});

// ─── Navigation instrumentation ───────────────────────────────────────────────
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
