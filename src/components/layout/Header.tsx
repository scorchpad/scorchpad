// src/components/layout/Header.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Site-wide navigation header.
// FIX: Replaced hardcoded "NEW PASTE" link placeholder with actual Clerk
// authentication controls (SignedIn / SignedOut / UserButton / SignInButton).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/nextjs';
import { ThemeToggle } from '../ui/ThemeToggle';

export function Header() {
  return (
    <header className="w-full h-16 border-b border-gray-200 dark:border-white/10 flex items-center justify-between px-4 sm:px-8 bg-white dark:bg-[#0A0A0A] top-0 sticky z-50 transition-colors">
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition">
        <div className="hidden sm:flex w-8 h-8 bg-indigo-600 dark:bg-orange-600 rounded items-center justify-center">
          <div className="w-4 h-4 border-2 border-white rotate-45" />
        </div>
        <span className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">
          SCORCH<span className="text-indigo-600 dark:text-orange-500">PAD</span>
        </span>
      </Link>

      {/* ── Right nav ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* WebCrypto status indicator */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-500/80 uppercase tracking-widest">
            WebCrypto Active
          </span>
        </div>
        <div className="hidden lg:block h-4 w-px bg-gray-200 dark:bg-white/10" />

        <Link
          href="/pricing"
          className="text-sm font-medium text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Pricing
        </Link>

        {/* Dashboard link — only visible when signed in */}
        <SignedIn>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Dashboard
          </Link>
        </SignedIn>

        <ThemeToggle />

        {/* ── Auth controls ───────────────────────────────────────────── */}
        <SignedOut>
          {/* Sign-in button — Clerk redirects back after auth */}
          <SignInButton mode="redirect">
            <button
              type="button"
              className="px-4 py-2 border border-gray-300 dark:border-white/20 text-gray-700 dark:text-white/80 text-xs font-bold rounded hover:border-indigo-500 dark:hover:border-orange-500 hover:text-indigo-600 dark:hover:text-orange-400 transition-all"
            >
              Sign in
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          {/* UserButton: avatar dropdown with account + sign-out */}
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-8 h-8',
              },
            }}
          />
        </SignedIn>

        {/* New paste CTA — always visible */}
        <Link
          href="/"
          className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded hover:bg-indigo-600 dark:hover:bg-orange-500 hover:text-white transition-all"
        >
          New paste
        </Link>
      </div>
    </header>
  );
}
