// next.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Next.js + Sentry build configuration.
//
// CHANGES FROM PREVIOUS VERSION
// ──────────────────────────────
// The following top-level withSentryConfig() options were deprecated in
// @sentry/nextjs ≥ 9 and now live under the `webpack` namespace:
//
//   BEFORE (deprecated — generated warnings on every build):
//     withSentryConfig(nextConfig, {
//       autoInstrumentServerFunctions: true,  ← top-level
//       disableLogger: true,                  ← top-level
//     })
//
//   AFTER (current API):
//     withSentryConfig(nextConfig, {
//       webpack: {
//         autoInstrumentServerFunctions: true,
//         treeshake: { removeDebugLogging: true },
//       },
//     })
//
// These were the only source of the two DEPRECATION WARNINGs in your build log.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Prisma, its pg adapter, and Razorpay use Node.js built-ins that cannot
  // be bundled for the Edge runtime or the browser. Listing them here tells
  // Next.js to resolve them as external modules in the server bundle only.
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@prisma/adapter-pg',
    'pg',
  ],

  experimental: {},
};

export default withSentryConfig(nextConfig, {
  // ── Sentry build-time options ───────────────────────────────────────────────

  org:     process.env.SENTRY_ORG     ?? 'scorchpad',
  project: process.env.SENTRY_PROJECT ?? 'scorchpad',

  // Suppress verbose Sentry CLI output outside CI to keep local builds clean.
  silent: !process.env.CI,

  // Upload source maps to Sentry and delete them from the build output so they
  // are never served to browsers (avoids exposing your source code).
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/**/*.map'],
  },

  // Proxy Sentry API calls through /monitoring to avoid ad-blocker interference.
  // The /monitoring route is handled transparently by Sentry's tunnelRoute feature.
  tunnelRoute: '/monitoring',

  // ── Webpack-scoped options ──────────────────────────────────────────────────
  // These previously lived at the top level but are now namespaced under
  // `webpack` in @sentry/nextjs ≥ 9. Using the top-level form still works
  // but generates deprecation warnings and will be removed in a future major.

  webpack: {
    // Automatically wrap all API route handlers with Sentry's error and
    // performance instrumentation. Without this, you'd need to manually wrap
    // each handler with Sentry.withSentry() or use the wrapApiHandler() helper.
    autoInstrumentServerFunctions: true,

    // Tree-shake Sentry's internal debug logging statements out of the
    // production bundle. Reduces client bundle size; has no effect on error
    // capture fidelity.
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
