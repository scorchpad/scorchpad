import type { Metadata } from 'next';
import { Shield, Lock, Eye, Zap, Key, Code, AlertTriangle, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About ScorchPad',
  robots: { index: true, follow: true },
};

const CRYPTO_SECTIONS = [
  {
    icon: Key,
    title: 'AES-256-GCM — Authenticated Encryption',
    content: `Every paste is encrypted using AES-256-GCM (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode). This is the same algorithm used by the US National Security Agency for TOP SECRET classified information.\n\nGCM mode provides both confidentiality and authenticity — meaning it's impossible to tamper with the ciphertext without the decryption failing. If anyone modifies even a single byte of the encrypted blob in transit or at rest, decryption will throw an authentication error rather than silently produce corrupted data. This protects you from active attackers, not just passive eavesdroppers.`,
  },
  {
    icon: Shield,
    title: 'PBKDF2-SHA256 at 310,000 Iterations — Password Hardening',
    content: `When you enable password protection on a paste, the password is never sent to our server. Instead, your browser derives the encryption key from the password using PBKDF2-SHA256 (Password-Based Key Derivation Function 2).\n\nThe iteration count of 310,000 meets the OWASP 2023 minimum recommendation. This means an attacker trying to brute-force the password must perform 310,000 SHA-256 operations per guess. On modern hardware, this limits an attacker to roughly a few thousand guesses per second per GPU — making offline brute-force attacks computationally expensive.\n\nThe PBKDF2 salt is a cryptographically random 16-byte value generated fresh for each paste. The server stores only the salt and a rate-limiting proof (an HMAC), never the password or the derived key.`,
  },
  {
    icon: Eye,
    title: 'Zero-Knowledge Architecture — The Server Is Blind',
    content: `Zero-knowledge means we hold zero knowledge of your paste content. This is an architectural guarantee, not a policy promise.\n\nHere is the exact sequence:\n\n1. You type your text in the editor.\n2. Your browser generates a cryptographically random 256-bit key using window.crypto.getRandomValues().\n3. Your browser encrypts the text using AES-256-GCM with that key.\n4. The encrypted blob is sent to our server. The key is NOT included.\n5. The key is placed only in the URL fragment (the part after #).\n6. Browsers, by specification, never include the URL fragment in HTTP requests. The server receives the URL path but never the fragment.\n7. When someone opens the link, their browser extracts the key from the fragment locally and decrypts the content locally.\n\nResult: our server stores an encrypted blob that is mathematically indistinguishable from random noise without the key. Even with full access to our database and infrastructure, your content cannot be read.`,
  },
  {
    icon: Zap,
    title: 'URL Fragment Erasure After Decryption',
    content: `After successful decryption, ScorchPad immediately calls history.replaceState() to remove the key fragment from the URL in your browser's address bar and history.\n\nWhy this matters: if you decrypt a paste and then share your screen, copy the URL, or your browser history is inspected, the key is no longer present. The URL becomes a dead link that cannot be used to re-decrypt the content.\n\nThis is a detail that no other mainstream pastebin implements. It is a small but meaningful operational security improvement for users in adversarial environments.`,
  },
  {
    icon: Lock,
    title: 'Clipboard Auto-Clear (30 Seconds)',
    content: `When you copy a share link that contains a key fragment (the full URL including #key), ScorchPad starts a 30-second countdown. When the countdown reaches zero, the clipboard is overwritten with an empty string.\n\nThis protects against clipboard inspection by malware, browser extensions, or a shared machine where you forget to clear your clipboard. The countdown is visible in the copy button so you always know when it will clear.`,
  },
  {
    icon: AlertTriangle,
    title: 'Atomic Burn-After-Reading (Race-Condition Proof)',
    content: `Burn-after-reading pastes (pastes with a view limit) are implemented using an atomic Lua script executed directly on the Redis server via EVAL.\n\nThe script atomically decrements the view counter and deletes the paste in a single operation. This means it is impossible for two concurrent requests to both receive the last view of a paste — a race condition that naive implementations are vulnerable to.\n\nConventional implementations check the count, then decrement in two separate operations. Between those two operations, a second request can slip in. Ours cannot be split.`,
  },
  {
    icon: Code,
    title: 'Sandboxed HTML Paste Rendering',
    content: `If you share an HTML paste, ScorchPad renders it inside an <iframe sandbox=""> with the most restrictive sandbox attribute possible — no flags set means all sandbox restrictions are active:\n\n— No JavaScript execution\n— No same-origin access (cannot read cookies, localStorage, or make API calls)\n— No form submission\n— No popups\n— No plugin execution\n\nPastebin renders HTML inline in the same origin as the application. That is an XSS (Cross-Site Scripting) vector — malicious HTML pastes could steal session tokens, exfiltrate data, or perform actions on behalf of the viewer. ScorchPad's sandboxed iframe makes this impossible.`,
  },
  {
    icon: CheckCircle,
    title: 'Non-Extractable CryptoKey on Viewer Side',
    content: `When your browser imports the decryption key for use, it is imported with extractable: false. This means the key cannot be extracted from the browser's Web Crypto API after import.\n\nIf a browser extension or injected script attempts to read the CryptoKey object to exfiltrate it, the Web Crypto API will refuse. The key can be used for decryption but cannot be read back as raw bytes. This is an additional layer of in-browser key protection on top of the URL fragment erasure.`,
  },
];

export default function AboutPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">

      {/* Hero */}
      <div className="mb-14">
        <p className="text-[10px] font-mono text-indigo-600 dark:text-orange-500 uppercase tracking-[0.3em] mb-3">
          About ScorchPad
        </p>
        <h1 className="text-4xl font-bold tracking-tighter mb-4 text-gray-900 dark:text-white">
          Built so we literally cannot read your data.
        </h1>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          ScorchPad is a zero-knowledge encrypted paste service built by Rsaat Labs. Every cryptographic decision was made to ensure that even we — the operators — cannot access your content under any circumstances, including legal compulsion.
        </p>
      </div>

      {/* What is ScorchPad */}
      <section className="mb-12 p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight mb-4">
          What is ScorchPad?
        </h2>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-4">
          ScorchPad is a pastebin — a tool for sharing text securely. Unlike traditional pastebins like Pastebin.com that store your text in plaintext on their servers (meaning they can read it, governments can subpoena it, and hackers who breach their database can read it), ScorchPad encrypts your content in your browser before it ever leaves your device.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          This is not a marketing claim. It is an architectural constraint. The cryptographic design makes it impossible — not merely unlikely — for us to read your content. The technical details below explain exactly how.
        </p>
      </section>

      {/* Crypto sections */}
      <div className="space-y-6 mb-12">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">
          Cryptographic Implementation Details
        </h2>

        {CRYPTO_SECTIONS.map(({ icon: Icon, title, content }) => (
          <div
            key={title}
            className="border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505] overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-[#080808]">
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-orange-500/10 border border-indigo-100 dark:border-orange-500/20 shrink-0">
                <Icon size={14} className="text-indigo-600 dark:text-orange-500" />
              </div>
              <h3 className="text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">
                {title}
              </h3>
            </div>
            <div className="px-5 py-4 text-[11px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide whitespace-pre-line">
              {content}
            </div>
          </div>
        ))}
      </div>

      {/* What we cannot do */}
      <section className="mb-12 p-6 border border-emerald-200 dark:border-emerald-500/20 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/5">
        <h2 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-tight mb-4">
          What We Cannot Do
        </h2>
        <ul className="space-y-2">
          {[
            'Read your paste content — we hold only encrypted ciphertext',
            'Provide decryption keys to governments or law enforcement — we never possess them',
            'Comply with a court order to produce plaintext content — there is nothing to produce',
            'Recover a lost link — the key is only in the URL fragment, which we never see',
            'Access a password-protected paste — the password is never sent to us',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-400/70">
              <span className="shrink-0 mt-0.5">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* Warrant canary explanation */}
      <section className="mb-12 p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight mb-3">
          What is a Warrant Canary?
        </h2>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          A warrant canary is a transparency mechanism used by privacy-focused services. ScorchPad publishes a statement — updated manually every month — confirming that we have NOT received any secret government orders, National Security Letters, or gag orders requiring us to compromise user privacy or install backdoors.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          The mechanism works through absence: if the canary page stops being updated, or if the statements change, that signals something has happened that prevents us from speaking openly. It is named after the "canary in a coal mine" — a warning system that works by dying.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          You can view our canary at <a href="/warrant-canary" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">/warrant-canary</a>. If it has not been updated within 45 days of the listed date, treat that as a signal.
        </p>
      </section>

      {/* Built by */}
      <section className="p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight mb-3">
          Built by Rsaat Labs
        </h2>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          ScorchPad is a product of Rsaat Labs — an independent software laboratory focused on privacy-by-architecture. We build tools where privacy is a structural property, not a setting.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          Other products: <a href="https://zenconvert.rsaatlabs.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">ZenConvert</a> (client-side file conversion, files never leave your device) · <a href="https://shadownf.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">SNF Labs</a> (passive network forensics engine, air-gap native).
        </p>
      </section>

    </div>
  );
}
