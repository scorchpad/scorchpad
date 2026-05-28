import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Security — Responsible Disclosure',
};

export default function SecurityPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">
      <h1 className="text-3xl font-bold tracking-tighter mb-2 text-gray-900 dark:text-white">
        Responsible Disclosure Policy
      </h1>
      <p className="text-sm text-gray-500 dark:text-white/40 font-mono mb-10">
        We welcome security reports from good-faith researchers.
      </p>

      {/* ── Report a Vulnerability ──────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-3">
          How to Report
        </h2>
        <p className="text-sm text-gray-600 dark:text-white/60 leading-relaxed mb-4">
          Email{' '}
          <a
            href="mailto:security@scorchpad.rsaatlabs.com"
            className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80 transition-opacity"
          >
            security@scorchpad.rsaatlabs.com
          </a>{' '}
          with a clear description of the issue, reproduction steps, and any
          supporting evidence. Encrypt sensitive reports with our PGP key at{' '}
          <a
            href="/pgp-key.txt"
            className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80"
          >
            /pgp-key.txt
          </a>
          .
        </p>
      </section>

      {/* ── Response SLA ────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-3">
          Response Timeline
        </h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-white/60">
          <li className="flex gap-3">
            <span className="text-indigo-600 dark:text-orange-500 font-bold shrink-0 w-28">Acknowledgment</span>
            Within 48 hours of receiving your report.
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-600 dark:text-orange-500 font-bold shrink-0 w-28">Triage</span>
            Within 5 business days.
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-600 dark:text-orange-500 font-bold shrink-0 w-28">Critical fix</span>
            Within 7 days of confirmed reproduction.
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-600 dark:text-orange-500 font-bold shrink-0 w-28">Disclosure</span>
            Coordinated — we will notify you before publishing any advisory.
          </li>
        </ul>
      </section>

      {/* ── In Scope ────────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-3">
          In Scope
        </h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-white/60">
          <li>Zero-knowledge encryption model (AES-256-GCM, PBKDF2 implementation)</li>
          <li>API route vulnerabilities (injection, broken access control, IDOR)</li>
          <li>Authentication or authorization bypass (Clerk session handling)</li>
          <li>Rate limit bypass on paste creation or password verification</li>
          <li>Information disclosure (paste content, decryption keys, raw IPs)</li>
          <li>Burn-after-reading race conditions or atomicity failures</li>
          <li>CSP bypass or XSS via decrypted paste rendering</li>
          <li>
            URL fragment leakage (key appearing in server logs, Sentry events,
            Referer headers)
          </li>
        </ul>
      </section>

      {/* ── Out of Scope ─────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-3">
          Out of Scope
        </h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-white/60">
          <li>Social engineering or phishing of ScorchPad staff</li>
          <li>Physical access to infrastructure</li>
          <li>Vulnerabilities in third-party services (Clerk, Vercel, Upstash, Sentry)</li>
          <li>Denial-of-service attacks</li>
          <li>Automated scanning without prior coordination</li>
          <li>Reports requiring unlikely user interaction or non-default browser settings</li>
        </ul>
      </section>

      {/* ── Safe Harbour ─────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-3">
          Safe Harbour
        </h2>
        <p className="text-sm text-gray-600 dark:text-white/60 leading-relaxed">
          We will not pursue legal action against researchers who act in good faith,
          avoid accessing or modifying data belonging to other users, and report
          findings to us before public disclosure. We ask that you avoid disrupting
          production services during investigation.
        </p>
      </section>

      {/* ── Hall of Fame ─────────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-3">
          Hall of Fame
        </h2>
        <p className="text-sm text-gray-600 dark:text-white/60 leading-relaxed">
          We publicly credit researchers who responsibly disclose valid vulnerabilities.
          Recognition is listed here after the fix ships and coordinated disclosure
          is complete. Thank you to everyone who has contributed.
        </p>
        <p className="text-xs font-mono text-gray-400 dark:text-white/25 mt-3">
          — No entries yet. Be the first.
        </p>
      </section>

      <p className="text-xs font-mono text-gray-400 dark:text-white/30">
        See also:{' '}
        <a
          href="/.well-known/security.txt"
          className="underline hover:text-indigo-600 dark:hover:text-orange-400 transition-colors"
        >
          /.well-known/security.txt
        </a>
      </p>
    </div>
  );
}
