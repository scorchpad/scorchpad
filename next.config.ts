import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Prisma, its pg adapter, and Razorpay use Node.js internals —
  // exclude from Edge/browser bundles.
  serverExternalPackages: ['@prisma/client', 'prisma', '@prisma/adapter-pg', 'pg'],

  experimental: {},
};

export default withSentryConfig(nextConfig, {
  // Sentry build-time options

  // Suppress Sentry CLI output outside CI
  silent: !process.env.CI,

  org:     process.env.SENTRY_ORG     ?? 'scorchpad',
  project: process.env.SENTRY_PROJECT ?? 'scorchpad',

  // Delete source maps after upload so they are not served to browsers
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/**/*.map'],
  },

  // Tunnel Sentry requests through /monitoring to avoid ad blockers
  tunnelRoute: '/monitoring',

  // Suppress Sentry debug logging in production bundles
  disableLogger: true,

  // Auto-wrap all API route handlers with Sentry error tracking
  autoInstrumentServerFunctions: true,
});
