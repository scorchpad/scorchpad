import type { Metadata } from 'next';

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
      <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 mb-12 tracking-wide">Last updated: May 28, 2026</p>

      <Section title="1. Who We Are">
        ScorchPad is a zero-knowledge encrypted paste service operated by Rsaat Labs, an independent software laboratory. "We", "us", and "our" refer to Rsaat Labs. "You" refers to any person accessing or using ScorchPad.
      </Section>

      <Section title="2. The Zero-Knowledge Architecture">
        ScorchPad is architected such that we are technically incapable of reading your paste content. Encryption and decryption occur entirely in your browser using the Web Cryptography API (AES-256-GCM). The decryption key exists only in the URL fragment — a portion of the URL that is never transmitted to our servers by any browser. Even if compelled by a court order, we cannot produce plaintext content we have never possessed.
      </Section>

      <Section title="3. What We Store">
        <p>We store the following on our servers:</p>
        <List items={[
          'Encrypted ciphertext blobs (unreadable without the key)',
          'Initialization vectors (IVs) used for encryption',
          'Password proof hashes (HMAC-SHA256, used only for rate limiting, not decryption)',
          'Paste metadata: expiry timestamp, view count, language tag, and size in bytes',
          'Rate limiting data: hashed and anonymized IP addresses (SHA-256 with a rotating secret; raw IPs are never stored)',
          'Subscription and account data if you create an account (name, email, subscription tier — via Clerk)',
        ]} />
        <p className="mt-4">We do NOT store: plaintext content, decryption keys, URL fragments, or any data that would allow us to read your pastes.</p>
      </Section>

      <Section title="4. Cookies and Local Storage">
        <p>We use browser localStorage for:</p>
        <List items={[
          'Theme preference (light/dark)',
          'Consent acknowledgement record',
        ]} />
        <p className="mt-4">We do not use advertising cookies, tracking pixels, or third-party analytics. We do not sell or share your data with advertisers.</p>
      </Section>

      <Section title="5. Third-Party Services">
        <p>ScorchPad uses the following third-party services, each with their own privacy policies:</p>
        <List items={[
          'Clerk (authentication) — clerk.com/privacy',
          'Upstash (Redis storage) — upstash.com/privacy',
          'Supabase (database) — supabase.com/privacy',
          'Vercel (hosting) — vercel.com/legal/privacy-policy',
          'Sentry (error tracking, no personal data) — sentry.io/privacy',
          'Resend (transactional email) — resend.com/privacy',
          'Razorpay (payments, India) — razorpay.com/privacy',
          'Lemon Squeezy (payments, international) — lemonsqueezy.com/privacy',
        ]} />
        <p className="mt-4">Payment processing is handled entirely by Razorpay and Lemon Squeezy. We do not store card numbers or payment details.</p>
      </Section>

      <Section title="6. Data Retention">
        Paste data is automatically deleted from our servers at the earlier of: (a) expiry time set by the creator, or (b) when the maximum view count is reached. Account data is retained while your account is active. Upon account deletion, your account data is removed within 30 days. Anonymized rate limiting data is retained for 24 hours.
      </Section>

      <Section title="7. Your Rights">
        You may request deletion of your account and associated data at any time by contacting us. Because paste content is encrypted and we hold no key, we cannot retrieve or delete paste content on your behalf — only the encrypted blob, which is meaningless without the key.
      </Section>

      <Section title="8. Children">
        ScorchPad is not directed at children under 13. If you are under 13, do not use this service. We do not knowingly collect data from children under 13.
      </Section>

      <Section title="9. Changes to This Policy">
        We may update this privacy policy. Continued use of ScorchPad after changes constitutes acceptance of the updated policy. The "last updated" date at the top of this page reflects the most recent revision.
      </Section>

      <Section title="10. Contact">
        For privacy-related inquiries: <a href="mailto:rsaatlabs@gmail.com" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">rsaatlabs@gmail.com</a>
      </Section>
    </div>
  );
}
