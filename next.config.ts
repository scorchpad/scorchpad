// next.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Next.js + Sentry build configuration.
//
// ─── CHANGE LOG ──────────────────────────────────────────────────────────────
//
// v3 → v4 (this version)
// ──────────────────────
// Fixed: ENOENT: no such file or directory,
//        lstat '/vercel/path0/.next/server/instrumentation.js.map'
//
// Root cause (two interacting behaviours):
//
//   1. Sentry's webpack plugin runs filesToDeleteAfterUpload after source map
//      upload, during the webpack emit phase (before Next.js finalises the
//      build). The previous glob '.next/**/*.map' matched ALL map files
//      including '.next/server/instrumentation.js.map'.
//
//   2. Next.js 15's "Collecting build traces" step runs AFTER webpack
//      compilation. It calls lstat() on every server-side JS file and its
//      companion .map file to determine bundle sizes and trace dependencies.
//      When it lstat()s '.next/server/instrumentation.js.map' and finds it
//      missing (Sentry deleted it), the build fails with ENOENT.
//
// Fix: narrow filesToDeleteAfterUpload to '.next/static/**/*.map' only.
//
//   WHY THIS IS CORRECT FROM A SECURITY PERSPECTIVE:
//
//   '.next/static/'  → JavaScript chunks served to browsers via CDN.
//     If source maps remain here, anyone can fetch them at predictable paths
//     (/_next/static/chunks/xxx.js.map) and reconstruct your source code.
//     These MUST be deleted after Sentry upload.
//
//   '.next/server/'  → Server-side JS executed in the Node.js (or Edge) runtime.
//     These files are never served to browsers. Vercel does not expose
//     '.next/server/' to the public internet. Source maps here carry zero
//     security risk and do not need deletion.
//     AND Next.js needs them on disk for its "Collecting build traces" step.
//
//   Conclusion: deleting '.next/server/**/*.map' provides zero security benefit
//   and breaks the build. Deleting '.next/static/**/*.map' provides full
//   security benefit (client source not exposed) without touching server files.
//
// v2 → v3 (previous version)
// ──────────────────────────
// Moved autoInstrumentServerFunctions + disableLogger from top-level
// withSentryConfig options into the `webpack` namespace (@sentry/nextjs ≥ 9).
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

  // Upload source maps to Sentry, then delete them from the client bundle so
  // they are never served to browsers.
  //
  // SCOPE: '.next/static/**/*.map' — client-side chunks only.
  //
  // DO NOT use '.next/**/*.map' here. That glob also matches server-side maps
  // in '.next/server/' which:
  //   (a) are never served to browsers anyway (no security gain in deleting them)
  //   (b) are required by Next.js's "Collecting build traces" step, which runs
  //       after webpack compilation and calls lstat() on companion .map files
  //       → ENOENT build failure if they are already deleted.
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },

  // Proxy Sentry API calls through /monitoring to avoid ad-blocker interference.
  // The /monitoring route is handled transparently by Sentry's tunnelRoute feature.
  tunnelRoute: '/monitoring',

  // ── Webpack-scoped options ──────────────────────────────────────────────────
  // These previously lived at the top level but are now namespaced under
  // `webpack` in @sentry/nextjs ≥ 9.

  webpack: {
    // Automatically wrap all API route handlers with Sentry's error and
    // performance instrumentation.
    autoInstrumentServerFunctions: true,

    // Tree-shake Sentry's internal debug logging out of the production bundle.
    // Reduces client bundle size; has no effect on error capture fidelity.
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
