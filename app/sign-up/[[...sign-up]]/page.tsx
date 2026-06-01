// app/sign-up/[[...sign-up]]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Clerk-hosted sign-up page.
// ─────────────────────────────────────────────────────────────────────────────

import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <div className="flex justify-center items-center py-20 px-4">
      <SignUp />
    </div>
  );
}
