// app/global-error.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Root-level React error boundary for the App Router.
//
// This component catches React rendering errors that escape all nested
// error.tsx boundaries — the "last resort" before the user sees a blank page.
// https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-global-errors
//
// ─── WHY THIS FILE IS REQUIRED ───────────────────────────────────────────────
//
//   Without global-error.tsx, React rendering errors that reach the root
//   (e.g. a crash inside RootLayout) produce a blank white page with no
//   feedback and — critically — no Sentry event, since the error never reaches
//   the Node.js process unhandledRejection hook.
//
//   @sentry/nextjs has been warning about the missing file on every build:
//   "It seems like you don't have a global error handler set up."
//
// ─── IMPORTANT: COMPLETE HTML DOCUMENT ───────────────────────────────────────
//
//   When a global error occurs, Next.js unmounts the entire React tree
//   including RootLayout. This component therefore renders a COMPLETE HTML
//   document (<html><body>…</body></html>). It cannot rely on layout.tsx,
//   globals.css, or any component that might itself be broken.
//
//   We use inline styles intentionally — if the Tailwind stylesheet fails to
//   load (e.g. the error occurs before hydration), the page still looks OK.
//
// ─── SECURITY ────────────────────────────────────────────────────────────────
//
//   Sentry.captureException() here uses the same SDK instance initialised in
//   instrumentation-client.ts, which has scrubFragmentFromEvent() as beforeSend.
//   URL fragments cannot leak through this error path either.
//
// ─── REACT 19 TYPE NOTE ──────────────────────────────────────────────────────
//
//   @types/react@19 removed the global `JSX` namespace entirely.
//   `JSX.Element` no longer resolves — use `React.JSX.Element` instead.
//   The `React` namespace is available globally in Next.js projects via the
//   auto-generated `next-env.d.ts` (written on first `next build`), so no
//   explicit `import React from 'react'` is required here.
//
//   Migration guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
//   Relevant type change: https://github.com/DefinitelyTyped/DefinitelyTyped/
//     pull/69022 — "Remove global JSX namespace from @types/react"
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface GlobalErrorProps {
  /** The uncaught render error. May include a Next.js digest for server errors. */
  error: Error & { digest?: string };
  /** Call this to attempt re-rendering the failed subtree from scratch. */
  reset: () => void;
}

// React.JSX.Element: the correct return type in @types/react ≥ 19.
// The global JSX namespace was removed; the type now lives under React.JSX.
export default function GlobalError({ error, reset }: GlobalErrorProps): React.JSX.Element {
  useEffect(() => {
    // Report the uncaught render error to Sentry.
    // scrubFragmentFromEvent() runs inside beforeSend — no URL fragments leak.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong — ScorchPad</title>
      </head>
      <body
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          minHeight:      '100dvh',
          margin:         0,
          padding:        '2rem',
          boxSizing:      'border-box',
          background:     '#0a0a0a',
          color:          '#e5e5e5',
          fontFamily:     'system-ui, -apple-system, sans-serif',
          gap:            '1.25rem',
          textAlign:      'center',
        }}
      >
        {/* Minimal flame icon — no external image dependency */}
        <span
          style={{ fontSize: '2.5rem', lineHeight: 1 }}
          role="img"
          aria-label="error"
        >
          🔥
        </span>

        <h1
          style={{
            margin:     0,
            fontSize:   '1.5rem',
            fontWeight: 700,
            color:      '#fafafa',
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            margin:    0,
            color:     '#a1a1aa',
            fontSize:  '0.9rem',
            maxWidth:  '36ch',
            lineHeight: 1.6,
          }}
        >
          An unexpected error occurred. The error has been reported automatically.
        </p>

        {/* Show the digest so the user can quote it to support */}
        {error.digest != null && (
          <p
            style={{
              margin:     0,
              fontSize:   '0.8rem',
              color:      '#71717a',
            }}
          >
            Reference:{' '}
            <code
              style={{
                fontFamily:  'ui-monospace, monospace',
                background:  '#18181b',
                padding:     '0.15em 0.4em',
                borderRadius:'0.25rem',
              }}
            >
              {error.digest}
            </code>
          </p>
        )}

        <button
          onClick={reset}
          style={{
            marginTop:    '0.5rem',
            padding:      '0.625rem 1.75rem',
            border:       'none',
            borderRadius: '0.375rem',
            background:   '#ef4444',
            color:        '#fff',
            fontWeight:   600,
            fontSize:     '0.875rem',
            cursor:       'pointer',
            letterSpacing:'0.01em',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
