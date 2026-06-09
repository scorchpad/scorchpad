// app/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Root layout — applies to every page.
//
// SECURITY FIX #2 — Nonce applied to inline script and ClerkProvider:
//
//   The middleware (middleware.ts) generates a per-request cryptographic nonce
//   and places it in the x-nonce request header. This layout reads it via
//   Next.js 15's async headers() API and applies it in two places:
//
//   1. The theme detection <script nonce={nonce}> — this inline script runs
//      before React hydration to prevent a flash of unstyled content (FOUC)
//      on dark-mode pages. Without the nonce it would be blocked by the new
//      CSP (which no longer contains 'unsafe-inline' for scripts).
//
//   2. <ClerkProvider nonce={nonce}> — Clerk v7 / @clerk/nextjs ≥ 5 accepts
//      a nonce prop and forwards it to every inline script it injects. Without
//      this, Clerk's session management and token refresh scripts would be
//      blocked by the CSP, breaking authentication entirely.
//
//   WHY ASYNC: headers() in Next.js 15 App Router returns a Promise — the
//   layout must be declared async to await it. This does NOT affect
//   client-side rendering; it only runs on the server (RSC).
//
//   WHY NOT CACHE: Returning a nonce in the response body forces Next.js to
//   treat this as a dynamic (non-cached) render, which is correct — the nonce
//   must change on every request. Caching a nonce would let any past CSP bypass.
// ─────────────────────────────────────────────────────────────────────────────

import './globals.css';
import { headers } from 'next/headers';
import { Header } from '../src/components/layout/Header';
import { Footer } from '../src/components/layout/Footer';
import { SecurityAuditMount } from '../src/components/SecurityAuditMount';
import { ConsentGate } from '../src/components/ConsentGate';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: { default: 'ScorchPad | Encrypted Pastebin', template: '%s | ScorchPad' },
  description:
    'Zero-knowledge encrypted text sharing. The server never sees your content. Auto-deletes after reading.',
  metadataBase: new URL('https://scorchpad.rsaatlabs.com'),
  openGraph: {
    title: 'ScorchPad | Encrypted Pastebin',
    description: 'Zero-knowledge encrypted text sharing.',
    url: 'https://scorchpad.rsaatlabs.com',
    siteName: 'ScorchPad',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

// FIX: AI/crawler crawlability — bot detection helper.
// Known crawler User-Agent substrings. Checked server-side so bots never
// receive the ConsentGate component at all, regardless of client-side state.
// This is belt-and-suspenders alongside the ConsentGate's own mounted-guard fix.
function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return [
    'claudebot', 'anthropic-ai',       // Anthropic
    'gptbot', 'chatgpt-user', 'oai-searchbot', // OpenAI
    'google-extended', 'googlebot', 'googleother', // Google
    'bingbot', 'bingpreview',           // Microsoft
    'perplexitybot',                    // Perplexity
    'youbot',                           // You.com
    'diffbot',                          // Diffbot
    'cohere-ai',                        // Cohere
    'bytespider',                       // ByteDance
    'applebot',                         // Apple
    'duckduckbot',                      // DuckDuckGo
    'slurp',                            // Yahoo
    'ia_archiver',                      // Internet Archive
    'facebookbot', 'facebookexternalhit', // Meta
    'twitterbot', 'linkedinbot',        // Social
    'semrushbot', 'ahrefsbot',          // SEO tools
  ].some(bot => ua.includes(bot));
}


// Next.js 15 App Router supports async server components and layouts natively.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FIX #2: Read the per-request nonce injected by middleware.ts.
  // Falls back to undefined if no nonce header is present (e.g. in tests or
  // if middleware is bypassed). Passing undefined to nonce props is harmless.
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? undefined;
  // FIX: skip ConsentGate entirely for known crawlers so they receive
  // clean, unobstructed HTML. The ConsentGate's own mounted-guard handles
  // all other cases; this is an additional server-side layer.
  const crawlerRequest = isBot(headersList.get('user-agent'));

  return (
    // FIX #2: nonce prop forwarded to ClerkProvider — Clerk v7 uses it to
    // set the nonce attribute on every inline script it injects, allowing
    // those scripts to execute under the nonce-based CSP.
    <ClerkProvider nonce={nonce}>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/*
           * FIX #2: nonce applied to this inline script.
           *
           * This script runs synchronously before React hydration to apply the
           * saved theme class to <html> — preventing a flash of the wrong theme.
           * Without the nonce, the browser would block this script under the
           * new CSP (which has removed 'unsafe-inline' from script-src).
           *
           * The nonce attribute value MUST match the 'nonce-{nonce}' directive
           * in the Content-Security-Policy header sent by middleware.ts.
           * Both values originate from the same generateNonce() call per request.
           */}
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
            }}
          />
        </head>
        <body className="font-sans antialiased bg-gray-50 dark:bg-[#050505] text-gray-900 dark:text-[#E0E0E0] min-h-screen flex flex-col selection:bg-indigo-500 dark:selection:bg-orange-500 selection:text-white">
          <SecurityAuditMount />
          {/* FIX: bots bypass ConsentGate entirely — they receive the full
              page content with no modal overlay in the server-rendered HTML. */}
          {crawlerRequest ? (
            <>
              <Header />
              <main className="flex-grow w-full max-w-6xl mx-auto px-6 pb-20">
                {children}
              </main>
              <Footer />
            </>
          ) : (
            <ConsentGate>
              <Header />
              <main className="flex-grow w-full max-w-6xl mx-auto px-6 pb-20">
                {children}
              </main>
              <Footer />
            </ConsentGate>
          )}
        </body>
      </html>
    </ClerkProvider>
  );
}
