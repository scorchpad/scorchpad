import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">
      <h1 className="text-3xl font-bold tracking-tighter mb-2 text-gray-900 dark:text-white">Privacy Policy</h1>
      <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 mb-10 tracking-wide">Last updated: May 28, 2026</p>

      {[
        {
          title: '1. Who We Are',
          body: `ScorchPad is a zero-knowledge encrypted paste service operated by Rsaat Labs, an independent software laboratory. "We", "us", and "our" refer to Rsaat Labs. "You" refers to any person accessing or using ScorchPad.`,
        },
        {
          title: '2. The Zero-Knowledge Architecture',
          body: `ScorchPad is architected such that we are technically incapable of reading your paste content. Encryption and decryption occur entirely in your browser using the Web Cryptography API (AES-256-GCM). The decryption key exists only in the URL fragment — a portion of the URL that is never transmitted to our servers by any browser. Even if compelled by a court order, we cannot produce plaintext content we have never possessed.`,
        },
        {
          title: '3. What We Store',
          body: `We store the following on our servers:\n\n— Encrypted ciphertext blobs (unreadable without the key)\n— Initialization vectors (IVs) used for encryption\n— Password proof hashes (HMAC-SHA256, used only for rate limiting, not decryption)\n— Paste metadata: expiry timestamp, view count, language tag, and size in bytes\n— Rate limiting data: hashed and anonymized IP addresses (SHA-256 with a rotating secret; raw IPs are never stored)\n— Subscription and account data if you create an account (name, email, subscription tier — via Clerk)\n\nWe do NOT store: plaintext content, decryption keys, URL fragments, or any data that would allow us to read your pastes.`,
        },
        {
          title: '4. Cookies and Local Storage',
          body: `We use browser localStorage for:\n\n— Theme preference (light/dark)\n— Consent acknowledgement record\n\nWe do not use advertising cookies, tracking pixels, or third-party analytics. We do not sell or share your data with advertisers.`,
        },
        {
          title: '5. Third-Party Services',
          body: `ScorchPad uses the following third-party services, each with their own privacy policies:\n\n— Clerk (authentication) — clerk.com/privacy\n— Upstash (Redis storage) — upstash.com/privacy\n— Supabase (database) — supabase.com/privacy\n— Vercel (hosting) — vercel.com/legal/privacy-policy\n— Sentry (error tracking, no personal data) — sentry.io/privacy\n— Resend (transactional email) — resend.com/privacy\n— Razorpay (payments, India) — razorpay.com/privacy\n— Lemon Squeezy (payments, international) — lemonsqueezy.com/privacy\n\nPayment processing is handled entirely by Razorpay and Lemon Squeezy. We do not store card numbers or payment details.`,
        },
        {
          title: '6. Data Retention',
          body: `Paste data is automatically deleted from our servers at the earlier of: (a) expiry time set by the creator, or (b) when the maximum view count is reached. Account data is retained while your account is active. Upon account deletion, your account data is removed within 30 days. Anonymized rate limiting data is retained for 24 hours.`,
        },
        {
          title: '7. Your Rights',
          body: `You may request deletion of your account and associated data at any time by contacting us. Because paste content is encrypted and we hold no key, we cannot retrieve or delete paste content on your behalf — only the encrypted blob, which is meaningless without the key.`,
        },
        {
          title: '8. Children',
          body: `ScorchPad is not directed at children under 13. If you are under 13, do not use this service. We do not knowingly collect data from children under 13.`,
        },
        {
          title: '9. Changes to This Policy',
          body: `We may update this privacy policy. Continued use of ScorchPad after changes constitutes acceptance of the updated policy. The "last updated" date at the top of this page reflects the most recent revision.`,
        },
        {
          title: '10. Contact',
          body: `For privacy-related inquiries: rsaatlabs@gmail.com`,
        },
      ].map(({ title, body }) => (
        <section key={title} className="mb-8">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white tracking-tight mb-3 uppercase">
            {title}
          </h2>
          <div className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide whitespace-pre-line border-l-2 border-gray-100 dark:border-white/5 pl-4">
            {body}
          </div>
        </section>
      ))}
    </div>
  );
}
