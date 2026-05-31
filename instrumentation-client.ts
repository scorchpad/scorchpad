// instrumentation-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side Sentry initialisation.
//
// Next.js loads this file in the browser bundle before the React tree mounts.
// Unlike instrumentation.ts, there is no register() wrapper — top-level code
// executes immediately.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
//
// ─── WHY THIS REPLACES sentry.client.config.ts ───────────────────────────────
//
//   The file convention changed in @sentry/nextjs ≥ 9 / Next.js 15:
//   • sentry.client.config.ts     DEPRECATED — still loaded, generates warning.
//                                  Will stop working with Turbopack (the new
//                                  default in Next.js 16).
//   • instrumentation-client.ts   CURRENT   — the canonical location.
//
// ─── WHAT RUNS HERE ──────────────────────────────────────────────────────────
//   • Sentry.init() for the browser SDK.
//   • Session Replay registration (captures DOM snapshots on errors).
//
// ─── SECURITY ────────────────────────────────────────────────────────────────
//   scrubFragmentFromEvent() is registered as beforeSend to ensure the client
//   SDK never forwards the AES-GCM decryption key (in the URL fragment) to
//   Sentry before the user navigates away from the pad page.
//   See src/lib/sentry.ts for the full security rationale.
//
// ─── IMPORTANT: NO SERVER-ONLY IMPORTS ───────────────────────────────────────
//   Everything imported here ends up in the browser bundle. Never import
//   Node.js built-ins, server-only packages, or database clients here.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from '@sentry/nextjs';
import { scrubFragmentFromEvent } from './src/lib/sentry';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:      process.env.NODE_ENV ?? 'development',
  release:          process.env.SENTRY_RELEASE,

  // Sample 10% of frontend performance traces in production.
  // Tune this against your Sentry plan quota; 0.1 is a conservative start.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay — captures a video-like DOM recording attached to errors.
  // 10% of normal sessions, 100% of sessions that encounter an error.
  // Recorded sessions are stored in Sentry and are NOT sent to Scorchpad servers.
  // Review Sentry's data retention policies if this is a compliance concern.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    // Replay must be explicitly added as an integration in @sentry/nextjs v8+.
    // It lazy-loads the recording worker only when a session is actually sampled,
    // so the performance cost on non-sampled sessions is negligible.
    Sentry.replayIntegration({
      // Mask all text nodes and block all media elements by default.
      // This prevents sensitive pad content from appearing in replay recordings.
      maskAllText:   true,
      blockAllMedia: true,
    }),
  ],

  // SECURITY: strip decryption keys from every captured event before it leaves
  // the browser. This is the last line of defence against fragment leakage.
  beforeSend: scrubFragmentFromEvent,

  debug: process.env.NODE_ENV !== 'production',
});

// ─── Navigation instrumentation ───────────────────────────────────────────────
//
// Required by @sentry/nextjs ≥ 9 to capture client-side route transitions as
// Sentry performance transactions. Without this export, navigations between
// App Router pages are invisible to Sentry — you see page-load spans but no
// navigation spans, making performance analysis incomplete.
//
// Build log warning this resolves:
//   [@sentry/nextjs] ACTION REQUIRED: To instrument navigations, the Sentry
//   SDK requires you to export an `onRouterTransitionStart` hook from your
//   `instrumentation-client.(js|ts)` file.
//
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
//       configuration/app-router/#navigation-instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
