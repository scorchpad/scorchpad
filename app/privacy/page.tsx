import type { Metadata } from 'next';

// Statically pre-generate at build time — makes page immediately crawlable
// by AI agents and search engines without hitting the Next.js server runtime.
export const dynamic = 'force-static';


export const metadata: Metadata = {
  title: 'Privacy Policy',
  robots: { index: true, follow: true },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xs font-bold text-gray-900 dark:text-white tracking-widest uppercase mb-4 pb-2 border-b border-gray-100 dark:border-white/5">
        {title}
      </h2>
      <div className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5 pl-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">
      <h1 className="text-3xl font-bold tracking-tighter mb-2 text-gray-900 dark:text-white">Privacy Policy</h1>
      <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 mb-6 tracking-wide">Last updated: May 28, 2026</p>

      {/* Plain English privacy declaration */}
      <div className="mb-10 p-5 border-2 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/5 rounded-xl">
        <p className="text-[10px] font-bold font-mono text-red-700 dark:text-red-400 uppercase tracking-widest mb-3">
          Plain Language Declaration
        </p>
        <p className="text-[13px] font-bold text-red-800 dark:text-red-300 leading-relaxed mb-4">
          RSAAT LABS HOLDS ZERO RESPONSIBILITY FOR ANY CONTENT SHARED THROUGH THIS SERVICE. WE ARE NOT LIABLE UNDER ANY LEGAL, NON-LEGAL, CIVIL, CRIMINAL, OR ANY OTHER SCENARIO ARISING FROM YOUR USE OF SCORCHPAD.
        </p>
        <p className="text-[11px] font-mono text-red-700/80 dark:text-red-400/70 leading-relaxed tracking-wide">
          We are a zero-knowledge encrypted intermediary. We cannot read your content. We cannot hand over what we do not have. You use this service entirely at your own risk and are solely responsible for everything you share through it.
        </p>
      </div>

      <Section title="1. Who We Are">
        ScorchPad is a zero-knowledge encrypted paste service operated by Rsaat Labs, an independent software laboratory. "We", "us", and "our" refer to Rsaat Labs. "You" refers to any person accessing or using ScorchPad.
      </Section>

      <Section title="2. The Zero-Knowledge Architecture — What This Means for Privacy">
        <p className="mb-4">ScorchPad is architecturally designed so that we are technically incapable of reading your paste content. Encryption and decryption occur entirely in your browser using the Web Cryptography API (AES-256-GCM). The decryption key exists only in the URL fragment — a portion of the URL that browsers never transmit in HTTP requests. Our servers receive only encrypted ciphertext.</p>
        <p className="mb-4">This is not a privacy policy claim — it is a technical fact. Even if compelled by a court order, subpoena, government demand, or any legal process, we cannot produce plaintext content we have never possessed. We cannot hand over what we do not have.</p>
        <p>This zero-knowledge guarantee applies exclusively to paste content. Other data described below (account information, metadata) is subject to standard privacy protections.</p>
      </Section>

      <Section title="3. What We Store — Complete Disclosure">
        <p>We store exactly the following. Nothing more.</p>

        <p className="mt-4 mb-2 font-bold text-gray-600 dark:text-white/60">In Redis (paste storage):</p>
        <List items={[
          'Encrypted ciphertext blobs — unreadable without the decryption key, which we never have',
          'Initialization vectors (IVs) — not sensitive without the key',
          'Password proof hashes (HMAC-SHA256) — used only for brute-force rate limiting, cannot be reversed to recover the password',
          'PBKDF2 salts — not sensitive on their own',
          'Paste metadata: expiry timestamp, view count limit, syntax language tag, ciphertext size in bytes',
          'All paste data auto-deletes at TTL expiry or upon reaching the maximum view count',
        ]} />

        <p className="mt-4 mb-2 font-bold text-gray-600 dark:text-white/60">In rate-limiting records:</p>
        <List items={[
          'HMAC-SHA256 hashed IP addresses only — raw IP addresses are NEVER stored anywhere',
          'Rate limit counters with 24-hour TTL',
          'The HMAC secret is unique to ScorchPad and cannot be used to reverse-engineer IP addresses',
        ]} />

        <p className="mt-4 mb-2 font-bold text-gray-600 dark:text-white/60">In Supabase (only if you create an account):</p>
        <List items={[
          'Email address (via Clerk authentication)',
          'Display name (optional, if provided)',
          'Subscription tier and plan details',
          'Clerk user ID',
          'Account creation and last-seen timestamps',
        ]} />

        <p className="mt-4 mb-2 font-bold text-gray-600 dark:text-white/60">We explicitly do NOT store:</p>
        <List items={[
          'Plaintext content — ever, under any circumstances',
          'Decryption keys — architecturally impossible',
          'URL fragments — never transmitted to us by browsers',
          'Raw IP addresses — only one-way HMAC hashes',
          'Passwords — only an HMAC proof token for rate limiting',
          'Browser fingerprints, device identifiers, or tracking identifiers',
          'Browsing history, navigation patterns, or analytics data',
        ]} />
      </Section>

      <Section title="4. Cookies and Local Storage">
        <p>We use browser localStorage only for:</p>
        <List items={[
          'Theme preference (light/dark mode) — stored locally, never transmitted',
          'Consent acknowledgement record — stored locally, never transmitted',
        ]} />
        <p className="mt-4">Zero advertising cookies. Zero tracking pixels. Zero third-party analytics. Zero fingerprinting. Zero behavioral tracking. We do not sell, rent, share, or trade your data with advertisers or data brokers. We never have and never will.</p>
      </Section>

      <Section title="5. Third-Party Services">
        <p>ScorchPad uses the following third-party services. Each processes data according to their own privacy policies:</p>
        <List items={[
          'Clerk (authentication) — processes email and name for sign-in. clerk.com/privacy',
          'Upstash (Redis storage) — stores encrypted blobs and rate limit records. upstash.com/privacy',
          'Supabase (Postgres database) — stores account records only. supabase.com/privacy',
          'Vercel (hosting) — serves the application. May process access logs. vercel.com/legal/privacy-policy',
          'Sentry (error tracking) — configured with aggressive content scrubbing. URL fragments and any potential key material are stripped before transmission. sentry.io/privacy',
          'Resend (transactional email) — processes email address for account emails only. resend.com/privacy',
          'Razorpay (payments, India) — processes payment data for Indian subscribers. razorpay.com/privacy',
          'Lemon Squeezy (payments, international) — processes payment data for international subscribers. lemonsqueezy.com/privacy',
        ]} />
        <p className="mt-4">Payment processing is handled entirely by Razorpay and Lemon Squeezy. We do not store, process, or have access to card numbers, bank details, or payment credentials of any kind.</p>
      </Section>

      <Section title="6. Sentry Error Tracking — Content Scrubbing">
        Error tracking is configured with strict content scrubbing before any data leaves your browser or our servers. URL fragments (which contain decryption keys) are stripped from all breadcrumb URLs. Any error event field containing keywords associated with keys, passwords, or plaintext is redacted. The ErrorBoundary catches and sanitizes crypto-related exceptions before Sentry transmission. Sentry cannot be used as a secondary channel to extract paste content or decryption keys.
      </Section>

      <Section title="7. Government and Law Enforcement Requests">
        <p className="mb-4">We do not voluntarily cooperate with any government agency, law enforcement body, intelligence agency, or regulatory authority. We are not an arm of the state and we do not proactively assist surveillance of any kind.</p>

        <p className="mb-3 font-bold text-gray-600 dark:text-white/60">WE WILL NOT RESPOND TO:</p>
        <List items={[
          'Informal police requests, letters, or verbal communications',
          'Administrative notices that do not constitute valid court orders',
          'Foreign government requests without a valid MLAT process through Indian courts',
          'Intelligence agency requests of any kind without proper legal process',
          'Requests from any body lacking jurisdiction over Rsaat Labs under Indian law',
        ]} />

        <p className="mt-4 mb-3 font-bold text-gray-600 dark:text-white/60">WE WILL ONLY RESPOND TO:</p>
        <List items={[
          'Valid orders issued by courts of competent jurisdiction in India with proper legal process',
          'After exhausting all available legal challenges to overbroad or legally deficient orders',
        ]} />

        <p className="mt-4 mb-3">When legally compelled to comply with a final, valid, unchallenged court order, we can only produce what we technically store:</p>
        <List items={[
          'Encrypted ciphertext — useless without the decryption key, which we do not have',
          'Paste metadata: expiry, view count, language, size — no content',
          'Creation timestamp',
          'HMAC-SHA256 hashed IP address — a one-way hash, not the raw IP',
          'Account information (email, name) only for registered users — anonymous pastes have zero linkage',
        ]} />

        <p className="mt-4">We cannot produce plaintext content, decryption keys, URL fragments, or raw IP addresses. No back door exists. We will notify affected users of legal requests before complying, unless explicitly prohibited by court order. If we are gagged, our warrant canary at <a href="/warrant-canary" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">/warrant-canary</a> will reflect this.</p>

        <div className="mt-4 p-4 border border-indigo-200 dark:border-orange-500/20 bg-indigo-50 dark:bg-orange-500/5 rounded-xl">
          <p className="text-[11px] font-mono text-indigo-700 dark:text-orange-400 leading-relaxed tracking-wide">
            NOTE ON CSAM: Notwithstanding the above, we will report child sexual abuse material (CSAM) to appropriate authorities as required by law (POCSO Act, India). This is the single exception to our no-voluntary-cooperation policy. It is non-negotiable and non-waivable.
          </p>
        </div>
      </Section>

      <Section title="8. Data Retention">
        <p>Paste data is automatically deleted from our servers at the earlier of: (a) the expiry time set by the creator, or (b) when the maximum view count is reached. Redis TTL handles deletion automatically and irrevocably — no manual intervention, no cleanup cron, no background worker.</p>
        <p className="mt-4">Account data is retained while your account is active. Upon account deletion, your account data is removed within 30 days. Rate limiting hashes are retained for 24 hours.</p>
        <p className="mt-4">We do not maintain backups of paste content. Once deleted by TTL or view limit, paste data is permanently unrecoverable.</p>
      </Section>

      <Section title="9. Your Rights">
        <p>You have the following rights regarding your personal data:</p>
        <List items={[
          'Right to access: request a copy of account data we hold about you',
          'Right to deletion: request deletion of your account and associated metadata',
          'Right to correction: request correction of inaccurate account data',
          'Right to portability: request your account data in a machine-readable format',
        ]} />
        <p className="mt-4">These rights apply to account data only. Because paste content is encrypted and we hold no key, we cannot retrieve, produce, or delete paste content on your behalf. Encrypted blobs with no account linkage are fully anonymous to us.</p>
        <p className="mt-4">To exercise your rights, contact: <a href="mailto:rsaatlabs@gmail.com" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">rsaatlabs@gmail.com</a>. We will respond within 30 days.</p>
      </Section>

      <Section title="10. Children">
        ScorchPad is not directed at, designed for, or intended for use by children under 13 years of age. We do not knowingly collect personal data from children under 13. If we become aware that we have collected data from a child under 13, we will delete it promptly.
      </Section>

      <Section title="11. Data Security">
        We implement reasonable technical and organizational security measures. However, no system is perfectly secure. We make no warranty that the Service is impenetrable. Our zero-knowledge architecture means a breach of our infrastructure does not expose paste content — but account data stored in Supabase and Clerk is subject to the security of those platforms. We are not liable for data breaches affecting third-party infrastructure.
      </Section>

      <Section title="12. International Data Transfers">
        ScorchPad uses cloud infrastructure (Vercel, Upstash, Supabase, Clerk) that may store and process data in multiple countries. By using the Service, you consent to the transfer of your data to these jurisdictions.
      </Section>

      <Section title="13. Changes to This Policy">
        We reserve the right to update this Privacy Policy at any time. Material changes will be reflected in the "last updated" date at the top of this page. Continued use of the Service after changes constitutes acceptance of the updated policy.
      </Section>

      <Section title="14. Contact">
        <p>For privacy-related inquiries or data requests:</p>
        <p className="mt-2"><a href="mailto:rsaatlabs@gmail.com" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">rsaatlabs@gmail.com</a></p>
        <p className="mt-2">Security vulnerabilities: <a href="/.well-known/security.txt" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">/.well-known/security.txt</a></p>
      </Section>
    </div>
  );
}
