import './globals.css';
import { Header } from '../src/components/layout/Header';
import { Footer } from '../src/components/layout/Footer';
import { SecurityAuditMount } from '../src/components/SecurityAuditMount';
import type { Metadata } from 'next';

// ── Clerk ─────────────────────────────────────────────────────────────────────
// ClerkProvider wraps the entire app tree.
// In the mock-only frontend phase the publishable key is a placeholder string;
// Claude replaces it with the real env var during backend wiring.
// Without this wrapper, adding <SignInButton> / <UserButton> later crashes the tree.
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: { default: 'ScorchPad — Encrypted Pastebin', template: '%s | ScorchPad' },
  description:
    'Zero-knowledge encrypted text sharing. The server never sees your content. Auto-deletes after reading.',
  metadataBase: new URL('https://scorchpad.rsaatlabs.com'),
  openGraph: {
    title: 'ScorchPad — Encrypted Pastebin',
    description: 'Zero-knowledge encrypted text sharing.',
    url: 'https://scorchpad.rsaatlabs.com',
    siteName: 'ScorchPad',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/*
           * Inline script: apply dark class BEFORE first paint to avoid flash.
           * dangerouslySetInnerHTML is intentional here — this is a controlled
           * script literal, not user content, so DOMPurify is not applicable.
           */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
            }}
          />
        </head>
        <body className="font-sans antialiased bg-gray-50 dark:bg-[#050505] text-gray-900 dark:text-[#E0E0E0] min-h-screen flex flex-col selection:bg-indigo-500 dark:selection:bg-orange-500 selection:text-white">
          <SecurityAuditMount />
          <Header />
          <main className="flex-grow w-full max-w-6xl mx-auto px-6 pb-20">
            {children}
          </main>
          <Footer />
        </body>
      </html>
    </ClerkProvider>
  );
}
