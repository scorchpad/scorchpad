import type { Metadata } from 'next';
import { Shield, Lock, Eye, Zap, Key, Code, AlertTriangle, CheckCircle, Database, Server, Globe, FileWarning, Bug, BarChart3, Github } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About',
  description:
    'ScorchPad is a fully open-source, zero-knowledge encrypted pastebin. ' +
    'AES-256-GCM encryption happens in your browser — the server never sees your decryption key. ' +
    'Features: burn-after-reading, URL-fragment erasure, clipboard auto-clear, atomic burn-after-reading, ' +
    'HMAC-SHA256 IP hashing, and a warrant canary. Source code: github.com/scorchpad/scorchpad.',
  robots: { index: true, follow: true },
  alternates: {
    types: {
      'text/plain': 'https://scorchpad.rsaatlabs.com/llms-full.txt',
    },
  },
};

const CRYPTO_SECTIONS = [
  {
    icon: Key,
    title: 'AES-256-GCM — Authenticated Encryption',
    content: `Every paste is encrypted using AES-256-GCM (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode). This is the same algorithm used by the US National Security Agency for TOP SECRET classified information.

GCM mode provides both confidentiality and authenticity — meaning it is impossible to tamper with the ciphertext without the decryption failing. If anyone modifies even a single byte of the encrypted blob in transit or at rest, decryption will throw an authentication error rather than silently produce corrupted data. This protects against active attackers, not just passive eavesdroppers.`,
  },
  {
    icon: Shield,
    title: 'PBKDF2-SHA256 at 310,000 Iterations — Password Hardening',
    content: `When you enable password protection on a paste, the password is never sent to our server. Instead, your browser derives the encryption key from the password using PBKDF2-SHA256 (Password-Based Key Derivation Function 2).

The iteration count of 310,000 meets the OWASP 2023 minimum recommendation. This means an attacker trying to brute-force the password must perform 310,000 SHA-256 operations per guess — limiting an attacker to roughly a few thousand guesses per second per GPU.

The PBKDF2 salt is a cryptographically random 32-byte value generated fresh for each paste. The server stores only the salt — never the password, the derived key, or any password-derived proof token.

Note: for password-protected pastes, there is no key in the URL fragment at all. The receiver must enter the correct password, from which their browser independently derives the identical AES key and decrypts locally. The URL is meaningless without the password.`,
  },
  {
    icon: Eye,
    title: 'Zero-Knowledge Architecture — The Server Is Blind',
    content: `Zero-knowledge means we hold zero knowledge of your paste content. This is an architectural guarantee, not a policy promise.

The exact sequence:`,
    steps: [
      'You type your text in the editor.',
      'Your browser generates a cryptographically random 256-bit key using window.crypto.getRandomValues().',
      'Your browser encrypts the text using AES-256-GCM with that key.',
      'The encrypted blob is sent to our server. The key is NOT included.',
      'The key is placed only in the URL fragment (the part after #).',
      'Browsers never include the URL fragment in HTTP requests — the server receives the path but never the fragment.',
      'When someone opens the link, their browser extracts the key from the fragment locally and decrypts locally.',
    ],
    footer: 'Our server stores an encrypted blob that is mathematically indistinguishable from random noise without the key. Even with full database access, your content cannot be read.',
  },
  {
    icon: Zap,
    title: 'URL Fragment Erasure After Decryption',
    content: `After successful decryption, ScorchPad immediately calls history.replaceState() to remove the key fragment from the URL in your browser's address bar and history.

If you decrypt a paste and then share your screen, copy the URL, or your browser history is inspected, the key is no longer present. The URL becomes a dead link that cannot be used to re-decrypt the content. No other mainstream pastebin implements this.`,
  },
  {
    icon: Lock,
    title: 'Clipboard Auto-Clear (30 Seconds)',
    content: `When you copy a share link that contains a key fragment, ScorchPad starts a 30-second countdown. When it reaches zero, the clipboard is overwritten with an empty string.

This protects against clipboard inspection by malware, browser extensions, or a shared machine where you forget to clear your clipboard. The countdown is visible in the copy button so you always know when it will clear.`,
  },
  {
    icon: AlertTriangle,
    title: 'Atomic Burn-After-Reading — Race-Condition Proof',
    content: `Burn-after-reading pastes are implemented using an atomic Lua script executed directly on the Redis server via EVAL.

The script atomically decrements the view counter and deletes the paste in a single operation. It is impossible for two concurrent requests to both receive the last view of a paste — a race condition that naive implementations are vulnerable to.

Conventional implementations check the count, then decrement in two separate operations. Between those two operations, a second request can slip in and read a paste that should have been destroyed. Ours cannot be split.`,
  },
  {
    icon: Code,
    title: 'Sandboxed HTML Paste Rendering',
    content: `HTML pastes are rendered inside an iframe with the sandbox="" attribute — the most restrictive sandboxing possible. All sandbox restrictions are active with no flags set:`,
    sandboxList: [
      'No JavaScript execution',
      'No same-origin access (cannot read cookies, localStorage, or make API calls)',
      'No form submission',
      'No popups or plugin execution',
    ],
    sandboxFooter: "Pastebin renders HTML inline in the same origin as the application — an XSS vector where malicious HTML could steal session tokens or exfiltrate data. ScorchPad's sandboxed iframe makes this impossible.",
  },
  {
    icon: CheckCircle,
    title: 'Non-Extractable CryptoKey on Viewer Side',
    content: `When your browser imports the decryption key for use, it is imported with extractable: false. This means the key cannot be extracted from the browser's Web Crypto API after import.

If a browser extension or injected script attempts to read the CryptoKey object, the Web Crypto API will refuse. The key can be used for decryption but cannot be read back as raw bytes — an additional layer of in-browser key protection on top of the URL fragment erasure.`,
  },
  {
    icon: Database,
    title: 'IP Hashing — Raw IPs Never Stored',
    content: `ScorchPad uses rate limiting to prevent abuse. Rate limits are enforced per IP address. However, raw IP addresses are never stored anywhere in our database or logs.

Every IP address is processed through HMAC-SHA256 with a secret key (IP_HASH_SECRET) that is unique to ScorchPad and never reused across our other products. The result is a one-way hash — it can be used to check rate limits but cannot be reversed to recover the original IP address.

This means even in a full database breach, no IP addresses can be extracted.`,
  },
  {
    icon: Shield,
    title: 'Password Rate Limiting — Redis Attempt Counter',
    content: `For password-protected pastes, the verify-password endpoint enforces a strict attempt limit without ever receiving the password. The server uses a sliding window counter stored in Redis, keyed on a combination of the hashed IP address and paste ID.

The counter allows 5 attempts per 15 minutes per paste per hashed IP. Once exhausted, the endpoint returns HTTP 429 Too Many Requests and rejects all further attempts until the window resets. The counter auto-expires after 15 minutes with no persistent record beyond that window.

The password is never transmitted to our server at any point — not as plaintext, not as a hash, and not as any derived value. The verify-password endpoint receives only an encrypted blob check request. Rate limiting is enforced entirely by counting attempts, not by inspecting any password-derived credential.`,
  },
  {
    icon: Code,
    title: 'DOMPurify Sanitization — Belt and Suspenders',
    content: `All decrypted content is passed through DOMPurify before being rendered in the browser, regardless of whether it is rendered as plain text, code, or HTML.

For plain text and code pastes: DOMPurify runs with HTML disabled, stripping any markup that might have been encoded in the ciphertext.

For HTML pastes: DOMPurify runs with a strict allowlist before the content is assigned to the sandboxed iframe's srcdoc attribute. Two independent layers — DOMPurify plus the sandbox — protect against XSS.

This "belt and suspenders" approach means that even if the sandboxed iframe were somehow misconfigured, DOMPurify would still strip malicious payloads before they reached the iframe.`,
  },
  {
    icon: Bug,
    title: 'Error Boundary + Sentry Scrubbing — No Leaks in Error Reports',
    content: `All decrypted content rendering is wrapped in a React ErrorBoundary. If decryption fails or throws an unexpected exception, the ErrorBoundary catches it and shows a safe error message. Raw crypto exceptions (which might contain key material or partial plaintext in their stack traces) are never shown to the user.

More importantly: ScorchPad uses Sentry for error tracking, but Sentry is configured with aggressive content scrubbing. Before any error event is sent to Sentry's servers:`,
    sentryList: [
      'URL fragments (which contain decryption keys) are stripped from all breadcrumb URLs',
      'Any field containing "key", "password", "decrypt", or "plaintext" is redacted',
      'The error boundary catches and classifies crypto exceptions before they reach Sentry',
    ],
    sentryFooter: 'This means even our error tracking system cannot be used to reconstruct decryption keys or paste content.',
  },
  {
    icon: BarChart3,
    title: 'Sliding Window Rate Limiting — Per Hashed IP',
    content: `All API endpoints are rate-limited using Upstash Redis sliding window rate limits, keyed by hashed IP address (never raw IPs).

The limits by endpoint:`,
    rateLimits: [
      { endpoint: 'POST /api/paste (create)', limit: 'Anonymous: 3/day · Free: 10/day · Pro: 50–unlimited/day' },
      { endpoint: 'GET /api/paste/:id (read)', limit: '20 per minute per IP' },
      { endpoint: 'POST /api/paste/:id/verify-password', limit: '5 per 15 minutes per paste per IP' },
    ],
    rateFooter: 'Rate limit keys are prefixed rl:pv:* and isolated from other Rsaat Labs products. Exceeding limits returns 429. No IP addresses are persisted.',
  },
  {
    icon: Server,
    title: 'Redis TTL Auto-Deletion — Zero Data Retention',
    content: `All paste data in Redis is stored with a TTL (time-to-live) set at creation time. When the TTL expires, Redis automatically deletes the data with no server intervention.

There is no cleanup cron job, no background worker, no scheduled task. The data simply ceases to exist at the configured expiry time. This means:`,
    ttlList: [
      'No window exists where a cron job running as root could access expired data',
      'No race condition between "mark as expired" and "delete" — TTL is atomic',
      'No possibility of data lingering due to a failed cleanup job',
    ],
    ttlFooter: 'Burn-after-reading pastes are deleted by the atomic Lua script on the last view, regardless of whether the TTL has elapsed.',
  },
];

const BREACH_SCENARIOS = [
  {
    threat: 'Database or Redis fully compromised',
    severity: 'low',
    severityLabel: 'Low impact',
    what: 'Attacker obtains encrypted blobs, IVs, PBKDF2 salts, HMAC proof tokens, paste metadata (expiry, view count, language, size in bytes), hashed IPs, and subscription data.',
    impact: 'Zero paste content exposed. The encrypted blobs are mathematically meaningless without decryption keys. Keys were never sent to the server. Hashed IPs cannot be reversed. HMAC proof tokens cannot reveal passwords.',
    note: 'The attacker could attempt offline brute-force against password-protected pastes by trying candidate passwords, deriving the PBKDF2 key, and attempting AES-256-GCM decryption. PBKDF2 at 310,000 iterations makes this computationally expensive. No proof token or server-stored password-derived value exists to assist validation.',
  },
  {
    threat: 'Full server code compromise (RCE)',
    severity: 'low',
    severityLabel: 'Low impact',
    what: 'Attacker gains control of the Node.js process and can inspect all incoming requests in real time.',
    impact: 'The attacker can see encrypted ciphertext arriving in API requests. They cannot see decryption keys — keys are in URL fragments which browsers never include in HTTP requests. They cannot retroactively decrypt existing pastes.',
    note: 'Pastes created after the compromise date could be at risk if the attacker modifies the server to return malicious JavaScript (see the JS supply chain scenario below).',
  },
  {
    threat: 'Clerk authentication breach',
    severity: 'medium',
    severityLabel: 'Medium impact',
    what: "Clerk (our auth provider) is compromised. Attacker gains access to user records: email addresses, names, and subscription tier.",
    impact: 'Paste content is not affected. Clerk holds zero paste data — paste storage is entirely in Upstash Redis, isolated from authentication. Account takeover is possible (attacker could use your account to create pastes), but existing paste content cannot be read.',
    note: null,
  },
  {
    threat: 'HTTPS traffic interception (MITM)',
    severity: 'none',
    severityLabel: 'No impact',
    what: 'An attacker intercepts network traffic between your browser and our server.',
    impact: "HTTPS with HSTS preloading prevents this attack. Even if somehow intercepted, the attacker sees only encrypted ciphertext — the key is in the URL fragment which is never transmitted. ScorchPad's security does not depend on HTTPS, but HTTPS provides an additional transport layer.",
    note: null,
  },
  {
    threat: 'Malicious JavaScript served from our domain (worst case)',
    severity: 'critical',
    severityLabel: 'Critical — real threat',
    what: 'An attacker gains control of our infrastructure and replaces our JavaScript with code that intercepts plaintext before encryption and exfiltrates it to a third-party server.',
    impact: 'This IS a real threat vector. Browser-based encryption cannot defend against a compromised JavaScript delivery pipeline — if the code running in your browser is malicious, it can read plaintext before encryption.',
    note: 'Mitigations in place: HSTS preloading (prevents DNS hijacking and SSL stripping), our warrant canary (signals if we have been compelled to backdoor the code), and HTTPS certificate transparency monitoring. Planned: Subresource Integrity (SRI) tags to allow browsers to verify script hashes match known-good values. This is the known limitation of all browser-based encryption.',
  },
];

const LIMITATIONS = [
  {
    title: 'JavaScript supply chain dependency',
    body: 'ScorchPad\'s zero-knowledge guarantee assumes the JavaScript delivered to your browser is honest. If our CDN or hosting provider is compromised, or if we are legally compelled to serve backdoored code, an attacker could intercept plaintext before it is encrypted. There is no browser-based defense against this. Our warrant canary exists to signal if this has ever happened.',
  },
  {
    title: 'Browser extension access',
    body: 'Browser extensions with broad permissions can read page content, intercept clipboard data, and observe network requests. A malicious extension could read plaintext before encryption. We recommend creating sensitive pastes in a browser profile with no extensions installed.',
  },
  {
    title: 'Screen recording and shoulder surfing',
    body: 'Plaintext is visible in the editor before you click "Create Secure Link". Anyone observing your screen can read it. URL fragment erasure only protects the link after decryption — it does not protect the moment of viewing.',
  },
  {
    title: 'No forward secrecy for stored pastes',
    body: 'Unlike HTTPS session keys, paste keys are long-lived. If the share URL is intercepted and archived, and the encryption is later broken (by advances in cryptanalysis or quantum computing), stored pastes could be decrypted retroactively. AES-256 is currently considered quantum-resistant, but this is a theoretical long-term consideration.',
  },
  {
    title: 'AI-assisted audit completed; formal third-party audit pending',
    body: 'A pre-launch code review was conducted by two independent Claude (Anthropic) AI instances reviewing the full source codebase separately. All findings were patched before public deployment. A formal audit by a named independent security firm has not yet been commissioned. AI-assisted review provides meaningful assurance on implementation correctness, particularly for code that wraps well-specified primitives like the Web Crypto API. It does not replace adversarial testing, dynamic analysis, or supply chain verification by a human auditor. Full findings are documented at /audit.',
  },
];

// JSON-LD for AI crawlers and structured data consumers.
// Placed at the top of the component so it appears early in the HTML body —
// well before the page's lengthy security sections — ensuring it is never
// truncated by tools that apply token or byte limits to fetched pages.
// <script type="application/ld+json"> is NOT subject to the nonce-based CSP
// because the browser treats it as inert structured data, not executable JS.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ScorchPad',
  url: 'https://scorchpad.rsaatlabs.com',
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'Web',
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'INR',
      description: '10 pastes/day, 24-hour expiry, up to 10 views, password protection included',
    },
    {
      '@type': 'Offer',
      name: 'Pro Annual',
      price: '999',
      priceCurrency: 'INR',
      billingDuration: 'P1Y',
      description: '90-day expiry, unlimited views, 1 MB paste size',
    },
  ],
  description:
    'Zero-knowledge encrypted pastebin. AES-256-GCM encryption in the browser. ' +
    'The server never possesses decryption keys. Fully open source.',
  isAccessibleForFree: true,
  codeRepository: 'https://github.com/scorchpad/scorchpad',
  license: 'https://github.com/scorchpad/scorchpad/blob/main/LICENSE',
  keywords: [
    'zero-knowledge encryption', 'AES-256-GCM', 'encrypted pastebin',
    'burn after reading', 'one-time secret', 'open source', 'self-hosted',
    'PBKDF2', 'warrant canary', 'client-side encryption',
  ],
  creator: {
    '@type': 'Organization',
    name: 'Rsaat Labs',
    url: 'https://rsaatlabs.com',
  },
  mainEntityOfPage: 'https://scorchpad.rsaatlabs.com/about',
  sameAs: [
    'https://scorchpad.rsaatlabs.com/llms-full.txt',
    'https://scorchpad.rsaatlabs.com/llms.txt',
    'https://github.com/scorchpad/scorchpad',
  ],
  featureList: [
    'AES-256-GCM authenticated encryption',
    'PBKDF2-SHA256 at 310,000 iterations for password-protected pastes',
    'Zero-knowledge architecture — server never receives decryption keys',
    'URL fragment erasure after decryption via history.replaceState()',
    'Clipboard auto-clear after 30 seconds',
    'Atomic burn-after-reading via Lua script on Redis (race-condition proof)',
    'Sandboxed HTML paste rendering (iframe sandbox="")',
    'Non-extractable CryptoKey import (extractable: false)',
    'HMAC-SHA256 IP hashing — raw IPs never stored',
    'DOMPurify sanitization on all decrypted content',
    'Nonce-based Content Security Policy (unsafe-inline removed)',
    'Redis TTL auto-deletion — no cleanup cron jobs',
    'Sentry content scrubbing — key material redacted before transmission',
    'Monthly warrant canary',
    'Fully open source — github.com/scorchpad/scorchpad',
  ],
};

export default function AboutPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">

      {/*
       * JSON-LD structured data — rendered at the very top of the component
       * so AI tools and search crawlers encounter it in the first kilobytes of
       * HTML, before the lengthy security sections that can push the Open Source
       * section and other key data past token or byte limits.
       *
       * type="application/ld+json" is not executable JavaScript and is
       * therefore NOT subject to the nonce-based CSP in middleware.ts.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <div className="mb-14">
        <p className="text-[10px] font-mono text-indigo-600 dark:text-orange-500 uppercase tracking-[0.3em] mb-3">
          About ScorchPad
        </p>
        <h1 className="text-4xl font-bold tracking-tighter mb-4 text-gray-900 dark:text-white">
          Built so we literally cannot read your data.
        </h1>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          ScorchPad is a zero-knowledge encrypted paste service built by{' '}
          <a href="https://rsaatlabs.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">Rsaat Labs</a>.
          Every cryptographic decision was made to ensure that even we — the operators — cannot access your content under any circumstances, including legal compulsion.
        </p>
      </div>

      {/* What is ScorchPad */}
      <section className="mb-12 p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">What is ScorchPad?</h2>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-4">
          ScorchPad is a pastebin — a tool for sharing text securely. Unlike traditional pastebins like Pastebin.com that store your text in plaintext on their servers (where they can read it, governments can subpoena it, and hackers who breach their database can steal it), ScorchPad encrypts your content in your browser before it ever leaves your device.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          This is not a marketing claim. It is an architectural constraint. The cryptographic design makes it impossible — not merely unlikely — for us to read your content. The technical details below explain exactly how.
        </p>
      </section>

      {/* Open source */}
      <section className="mb-12 p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <div className="flex items-center gap-2 mb-3">
          <Github size={14} className="text-gray-600 dark:text-white/60" />
          <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest">Open Source</h2>
        </div>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          ScorchPad is fully open source. The entire codebase — frontend, backend API, encryption logic, and database schema — is publicly available on GitHub.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-4">
          For a zero-knowledge tool, open source is not just a philosophy — it is the only way to substantiate the claims on this page. You should not have to trust our word that the server never receives your decryption key. You should be able to read the code and verify it yourself.
        </p>
        <ul className="space-y-2 mb-5">
          {[
            'src/lib/crypto.ts — the full AES-256-GCM WebCrypto implementation',
            'src/lib/urlFragment.ts — how keys are encoded into and erased from URL fragments',
            'app/api/paste/create/route.ts — what the server actually receives (ciphertext only)',
            'middleware.ts — nonce-based CSP that prevents unauthorized script injection',
            'lib/ip.ts — HMAC-SHA256 IP hashing, raw IPs never stored',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[11px] font-mono text-gray-500 dark:text-white/40">
              <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
              {item}
            </li>
          ))}
        </ul>
        <a
          href="https://github.com/scorchpad/scorchpad"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[11px] font-mono font-bold text-indigo-600 dark:text-orange-400 hover:opacity-80 transition-opacity border border-indigo-200 dark:border-orange-500/30 rounded-lg px-4 py-2.5 bg-indigo-50/50 dark:bg-orange-500/5"
        >
          <Github size={13} />
          github.com/scorchpad/scorchpad
        </a>
      </section>

      {/* Crypto sections */}
      <div className="space-y-5 mb-16">
        <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest">
          Cryptographic and Security Implementation
        </h2>

        {CRYPTO_SECTIONS.map(({ icon: Icon, title, content, steps, footer, sandboxList, sandboxFooter, sentryList, sentryFooter, rateLimits, rateFooter, ttlList, ttlFooter }) => (
          <div key={title} className="border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-[#080808]">
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-orange-500/10 border border-indigo-100 dark:border-orange-500/20 shrink-0">
                <Icon size={14} className="text-indigo-600 dark:text-orange-500" />
              </div>
              <h3 className="text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">{title}</h3>
            </div>
            <div className="px-5 py-4 text-[11px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
              <p className="whitespace-pre-line">{content}</p>
              {steps && (
                <ol className="mt-3 space-y-1.5 pl-1">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="text-indigo-500 dark:text-orange-400 font-bold shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              {footer && <p className="mt-3">{footer}</p>}
              {sandboxList && (
                <ul className="mt-3 space-y-1.5 pl-1">
                  {sandboxList.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {sandboxFooter && <p className="mt-3">{sandboxFooter}</p>}
              {sentryList && (
                <ul className="mt-3 space-y-1.5 pl-1">
                  {sentryList.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {sentryFooter && <p className="mt-3">{sentryFooter}</p>}
              {rateLimits && (
                <div className="mt-3 space-y-2">
                  {rateLimits.map((r) => (
                    <div key={r.endpoint} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                      <span className="text-indigo-500 dark:text-orange-400 shrink-0 font-bold">{r.endpoint}</span>
                      <span className="text-gray-400 dark:text-white/30">{r.limit}</span>
                    </div>
                  ))}
                </div>
              )}
              {rateFooter && <p className="mt-3">{rateFooter}</p>}
              {ttlList && (
                <ul className="mt-3 space-y-1.5 pl-1">
                  {ttlList.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {ttlFooter && <p className="mt-3">{ttlFooter}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* What we cannot do */}
      <section className="mb-12 p-6 border border-emerald-200 dark:border-emerald-500/20 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/5">
        <h2 className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest mb-4">What We Cannot Do</h2>
        <ul className="space-y-2">
          {[
            'Read your paste content — we hold only encrypted ciphertext',
            'Provide decryption keys to governments or law enforcement — we never possess them',
            'Comply with a court order to produce plaintext content — there is nothing to produce',
            'Recover a lost link — the key is only in the URL fragment, which we never see',
            'Access a password-protected paste — the password is never sent to us',
            'Identify you by IP address — only one-way HMAC hashes are stored',
            'Produce plaintext from Sentry error reports — content is scrubbed before transmission',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-400/70">
              <CheckCircle size={12} className="shrink-0 mt-0.5 text-emerald-500" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* What if we get hacked */}
      <section className="mb-12">
        <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-2">What Happens If ScorchPad Gets Hacked?</h2>
        <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 tracking-wide mb-6">
          Honest threat modeling — what an attacker actually gets in each scenario.
        </p>
        <div className="space-y-4">
          {BREACH_SCENARIOS.map((s) => (
            <div key={s.threat} className="border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505] overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-[#080808]">
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full shrink-0 ${
                  s.severity === 'none' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                  s.severity === 'low' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                  s.severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>{s.severityLabel}</span>
                <h3 className="text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">{s.threat}</h3>
              </div>
              <div className="px-5 py-4 space-y-3 text-[11px] font-mono">
                <div>
                  <span className="text-gray-400 dark:text-white/30 uppercase tracking-widest text-[9px]">What the attacker gets: </span>
                  <span className="text-gray-500 dark:text-white/50">{s.what}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-white/30 uppercase tracking-widest text-[9px]">Impact on your pastes: </span>
                  <span className={s.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-white/50'}>{s.impact}</span>
                </div>
                {s.note && (
                  <div className="pt-1 border-t border-gray-100 dark:border-white/5">
                    <span className="text-gray-400 dark:text-white/30 uppercase tracking-widest text-[9px]">Note: </span>
                    <span className="text-gray-400 dark:text-white/30">{s.note}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Known limitations */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-6">
          <FileWarning size={14} className="text-yellow-500 dark:text-yellow-400" />
          <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest">Known Limitations — Honest Disclosure</h2>
        </div>
        <div className="space-y-4">
          {LIMITATIONS.map((l) => (
            <div key={l.title} className="border border-yellow-200 dark:border-yellow-500/20 rounded-xl bg-yellow-50/50 dark:bg-yellow-500/5 p-5">
              <h3 className="text-[11px] font-bold text-yellow-800 dark:text-yellow-400 uppercase tracking-widest mb-2">{l.title}</h3>
              <p className="text-[11px] font-mono text-yellow-700/70 dark:text-yellow-400/50 leading-relaxed tracking-wide">{l.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Warrant canary */}
      <section className="mb-12 p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-3">What is a Warrant Canary?</h2>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          A warrant canary is a transparency mechanism. ScorchPad publishes a statement — updated manually every month — confirming that we have NOT received any secret government orders, National Security Letters, or gag orders requiring us to compromise user privacy or install backdoors.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          The mechanism works through absence: if the canary page stops being updated, or if the statements change, that signals something has happened that prevents us from speaking openly. It is named after the canary in a coal mine — a warning system that works by dying.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          View our canary at{' '}
          <a href="/warrant-canary" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">/warrant-canary</a>.
          If it has not been updated within 45 days, treat that as a signal.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          ScorchPad also maintains a responsible disclosure policy and security contact at{' '}
          <a href="/.well-known/security.txt" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">/.well-known/security.txt</a>.
          If you find a security vulnerability, please report it there.
        </p>
      </section>

      {/* Built by */}
      <section className="p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-3">Built by Rsaat Labs</h2>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          ScorchPad is a product of{' '}
          <a href="https://rsaatlabs.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">Rsaat Labs</a>
          {' '}— an independent software laboratory focused on privacy-by-architecture. We build tools where privacy is a structural property, not a setting.
        </p>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          Other products:{' '}
          <a href="https://zenconvert.rsaatlabs.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">ZenConvert</a>
          {' '}(client-side file conversion, files never leave your device) and{' '}
          <a href="https://shadownf.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">SNF Labs</a>
          {' '}(passive network forensics engine, air-gap native).
        </p>
      </section>

    </div>
  );
}
