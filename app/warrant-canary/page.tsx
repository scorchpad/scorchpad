import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Warrant Canary',
  robots: { index: true, follow: true },
};

// ── IMPORTANT — MANUAL MONTHLY UPDATE REQUIRED ────────────────────────────────
//
// This date MUST be updated by hand every month.
// DO NOT replace with new Date() or any dynamic expression.
//
// The canary's entire purpose is that humans can verify this date hasn't
// changed. An auto-generated date updates on every deploy and is meaningless.
//
// Protocol:
//   1. Update LAST_UPDATED below to today's date (YYYY-MM-DD).
//   2. Sign this file (or its hash) with the PGP key at /public/pgp-key.txt.
//   3. Commit and push. The commit timestamp is secondary evidence.
//
// If this page is NOT updated within 45 days of the date below,
// treat that absence as a signal that normal operations have been compromised.
//
const LAST_UPDATED = '2026-05-28';

export default function WarrantCanaryPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">
      <h1 className="text-3xl font-bold tracking-tighter mb-2 text-gray-900 dark:text-white">
        Warrant Canary
      </h1>
      <p className="font-mono text-sm text-gray-500 dark:text-white/40 mb-8">
        Last updated:{' '}
        <strong className="text-gray-800 dark:text-white/80">{LAST_UPDATED}</strong>
        {' '}— updated manually every month.
        <br />
        If not updated within 45 days of the above date, treat its absence as a signal.
      </p>

      <div className="p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#080808] shadow-sm dark:shadow-lg mb-8">
        <p className="text-sm text-gray-700 dark:text-white/80 mb-4 font-medium">
          ScorchPad and Rsaat Labs have <strong>never</strong>:
        </p>
        <ul className="space-y-3 text-sm text-gray-600 dark:text-white/60">
          <li className="flex gap-3">
            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
            Received a National Security Letter.
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
            Been subject to a gag order preventing disclosure of legal demands.
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
            Been compelled to introduce backdoors into our encryption.
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
            Provided decryption keys to any government, law enforcement, or third party.
            <span className="text-gray-400 dark:text-white/30 italic text-xs">
              (Note: we cryptographically cannot — keys never reach our servers.)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
            Been subject to any court order requiring user data disclosure.
          </li>
        </ul>
      </div>

      <p className="text-xs font-mono text-gray-400 dark:text-white/30">
        This canary is signed with PGP. Public key:{' '}
        <a
          href="/pgp-key.txt"
          className="underline hover:text-indigo-600 dark:hover:text-orange-400 transition-colors"
        >
          /pgp-key.txt
        </a>
      </p>
    </div>
  );
}
