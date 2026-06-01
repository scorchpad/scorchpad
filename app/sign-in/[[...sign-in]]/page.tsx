// app/sign-in/[[...sign-in]]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Clerk-hosted sign-in page.
// The [...sign-in] catch-all route lets Clerk handle MFA, OAuth callbacks,
// and all multi-step flows within this single route.
// ─────────────────────────────────────────────────────────────────────────────

import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div className="flex justify-center items-center py-20 px-4">
      <SignIn />
    </div>
  );
}
