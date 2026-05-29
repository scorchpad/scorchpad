'use client';
import { PricingCard } from '../../src/components/pricing/PricingCard';
import { useState } from 'react';
import { Check, X, Shield, Zap, Eye, Lock, Flame } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE FLAG: set to true once Lemon Squeezy is approved and live
// ─────────────────────────────────────────────────────────────────────────────
const INTERNATIONAL_PAYMENTS_ENABLED = false;

const COMPARISON = [
  { feature: 'Zero-knowledge encryption', scorchpad: true, pastebin: false, privatebin: true, onetimesecret: false },
  { feature: 'AES-256-GCM + PBKDF2 (310k iterations)', scorchpad: true, pastebin: false, privatebin: 'partial', onetimesecret: false },
  { feature: 'Key never touches the server', scorchpad: true, pastebin: false, privatebin: true, onetimesecret: false },
  { feature: 'URL fragment key erasure after decrypt', scorchpad: true, pastebin: false, privatebin: false, onetimesecret: false },
  { feature: 'Clipboard auto-clear (30s)', scorchpad: true, pastebin: false, privatebin: false, onetimesecret: false },
  { feature: 'Burn after reading (race-condition proof)', scorchpad: true, pastebin: false, privatebin: true, onetimesecret: true },
  { feature: 'Password + zero-knowledge combined', scorchpad: true, pastebin: false, privatebin: 'partial', onetimesecret: false },
  { feature: 'Sandboxed HTML paste rendering', scorchpad: true, pastebin: false, privatebin: false, onetimesecret: false },
  { feature: 'Syntax highlighting', scorchpad: true, pastebin: true, privatebin: true, onetimesecret: false },
  { feature: 'Warrant canary', scorchpad: true, pastebin: false, privatebin: false, onetimesecret: false },
  { feature: 'No ads (Pro)', scorchpad: true, pastebin: 'partial', privatebin: true, onetimesecret: true },
  { feature: 'Modern UI', scorchpad: true, pastebin: false, privatebin: false, onetimesecret: 'partial' },
];

type CellValue = boolean | 'partial';

function ComparisonCell({ value }: { value: CellValue }) {
  if (value === true)
    return <Check size={15} className="mx-auto text-emerald-500" />;
  if (value === 'partial')
    return <span className="text-[10px] font-mono text-yellow-500 uppercase tracking-widest">Partial</span>;
  return <X size={15} className="mx-auto text-gray-300 dark:text-white/15" />;
}

const REASONS = [
  {
    icon: Shield,
    title: 'Your server never sees the key',
    body: 'ScorchPad encrypts in your browser using AES-256-GCM before anything leaves your device. The decryption key lives exclusively in the URL fragment — a part of the URL that browsers never send to servers. Even with full database access, we literally cannot read your pastes.',
  },
  {
    icon: Zap,
    title: 'PBKDF2 at 310,000 iterations — not theatre',
    body: "Most tools that claim \"password protection\" store a hash server-side and decrypt for you. That's not zero-knowledge — that's just obfuscation. ScorchPad derives the encryption key from your password entirely in the browser using PBKDF2-SHA256 at the OWASP 2023 minimum. The server receives only a rate-limiting proof. Never the key.",
  },
  {
    icon: Eye,
    title: 'The link self-destructs properly',
    body: 'After you decrypt a paste, ScorchPad erases the key from your browser URL using history.replaceState. It also auto-clears your clipboard 30 seconds after copying a share link. Burn-after-reading uses an atomic Redis Lua script — no race condition means no concurrent reads sneaking past the view limit.',
  },
  {
    icon: Lock,
    title: 'HTML pastes run in a sandboxed iframe',
    body: "If you share an HTML paste, ScorchPad renders it inside a fully sandboxed iframe with zero permissions. No scripts, no same-origin access, no cookie access. Pastebin renders HTML inline. That's an XSS vector. Ours isn't.",
  },
  {
    icon: Flame,
    title: 'We publish a warrant canary',
    body: "ScorchPad maintains a publicly accessible warrant canary — a signed statement updated monthly confirming we have not received secret government orders to compromise user data. If it ever stops updating, that's the signal. No other mainstream pastebin does this.",
  },
];

export default function PricingPage() {
  // 'india' = Razorpay (INR), 'intl' = Lemon Squeezy (USD)
  const [region, setRegion] = useState<'india' | 'intl'>('india');
  const isIndia = region === 'india';

  const freeFeatures = [
    { text: '50 KB max paste size', included: true },
    { text: '10 pastes per day', included: true },
    { text: 'Up to 24 hours expiry', included: true },
    { text: 'Up to 10 views', included: true },
    { text: 'Password protection', included: false },
    { text: 'Custom view limits', included: false },
    { text: 'Full syntax highlighting', included: false },
    { text: 'No ads', included: false },
  ];

  const proFeatures = [
    { text: '500 KB paste size (1 MB on Annual)', included: true },
    { text: '50/day · 150/day · Unlimited (Annual)', included: true },
    { text: 'Up to 90 days expiry (Annual)', included: true },
    { text: 'Custom views (1–9999) or Unlimited', included: true },
    { text: 'Password protection', included: true },
    { text: 'Custom view limits', included: true },
    { text: 'Full syntax highlighting', included: true },
    { text: 'No ads', included: true },
  ];

  return (
    <div className="flex flex-col items-center pt-12 pb-24">

      {/* ── Hero ── */}
      <div className="text-center max-w-2xl mx-auto mb-10 px-4">
        <h1 className="text-4xl font-bold tracking-tighter mb-4 text-gray-900 dark:text-white uppercase">
          Subscription Plans
        </h1>
        <p className="text-[11px] font-mono text-gray-600 dark:text-white/50 tracking-wide">
          Unlock password protection, custom view counts, and large payloads.
        </p>
      </div>

      {/* ── Region tab switcher ── */}
      <div className="flex items-center gap-2 mb-12 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-1">
        {/* International tab — disabled until LS approved */}
        <button
          disabled={!INTERNATIONAL_PAYMENTS_ENABLED}
          onClick={() => INTERNATIONAL_PAYMENTS_ENABLED && setRegion('intl')}
          className={`relative px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${
            region === 'intl' && INTERNATIONAL_PAYMENTS_ENABLED
              ? 'bg-white dark:bg-[#111] text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-white/10'
              : INTERNATIONAL_PAYMENTS_ENABLED
              ? 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 cursor-pointer'
              : 'text-gray-400 dark:text-white/20 cursor-not-allowed'
          }`}
        >
          $
          {!INTERNATIONAL_PAYMENTS_ENABLED && (
            <span className="ml-2 text-[9px] font-bold text-indigo-500 dark:text-orange-400 uppercase tracking-widest">
              Coming Soon
            </span>
          )}
        </button>

        {/* India tab — always active */}
        <button
          onClick={() => setRegion('india')}
          className={`px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${
            region === 'india'
              ? 'bg-white dark:bg-[#111] text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-white/10'
              : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
          }`}
        >
          India
          <span className="ml-2 text-[9px] font-normal text-gray-400 dark:text-white/30 normal-case tracking-normal">
            (UPI)
          </span>
        </button>
      </div>

      {/* ── International coming soon banner ── */}
      {!INTERNATIONAL_PAYMENTS_ENABLED && (
        <div className="w-full max-w-2xl mx-auto px-4 mb-10">
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl border border-indigo-200 dark:border-orange-500/20 bg-indigo-50/50 dark:bg-orange-500/5 text-[11px] font-mono text-indigo-700 dark:text-orange-400 tracking-wide">
            <span className="shrink-0">⚡</span>
            International payments ($) are coming soon — currently processing our payment provider approval. Indian users can subscribe right now via UPI, NetBanking, or Card.
          </div>
        </div>
      )}

      {/* ── Pricing cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 w-full max-w-7xl mx-auto px-4">
        <PricingCard
          plan="free"
          title="Free"
          price="Free"
          description="Basic secure sharing for everyone."
          features={freeFeatures}
          isPro={false}
          isIndia={isIndia}
        />
        <PricingCard
          plan="monthly"
          title="Pro Monthly"
          price={isIndia ? '₹149' : '$3'}
          description="Unlock the full power of ScorchPad."
          features={proFeatures}
          isPro={false}
          isIndia={isIndia}
        />
        <PricingCard
          plan="half-yearly"
          title="Pro Half-Yearly"
          price={isIndia ? '₹599' : '$12'}
          description="6-month plan for power users."
          features={proFeatures}
          isPro={true}
          isIndia={isIndia}
        />
        <PricingCard
          plan="annual"
          title="Pro Annual"
          price={isIndia ? '₹999' : '$24'}
          description="Maximum storage, unlimited pastes."
          features={proFeatures}
          isPro={true}
          isIndia={isIndia}
        />
      </div>

      {/* ── Why ScorchPad narrative ── */}
      <div className="w-full max-w-4xl mx-auto px-4 mt-32">
        <div className="text-center mb-16">
          <p className="text-[10px] font-mono text-indigo-600 dark:text-orange-500 uppercase tracking-[0.3em] mb-3">
            Why ScorchPad
          </p>
          <h2 className="text-3xl font-bold tracking-tighter text-gray-900 dark:text-white uppercase">
            Every other pastebin can read your data.
          </h2>
          <p className="text-[11px] font-mono text-gray-500 dark:text-white/40 mt-4 max-w-xl mx-auto leading-relaxed tracking-wide">
            Not a policy claim. An architectural fact. Here is exactly why ScorchPad is different — and why it matters.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {REASONS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-6 p-6 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505] shadow-sm dark:shadow-lg transition-colors"
            >
              <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-orange-500/10 border border-indigo-100 dark:border-orange-500/20">
                <Icon size={18} className="text-indigo-600 dark:text-orange-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white tracking-tight mb-2">
                  {title}
                </h3>
                <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comparison table ── */}
      <div className="w-full max-w-4xl mx-auto px-4 mt-32">
        <div className="text-center mb-12">
          <p className="text-[10px] font-mono text-indigo-600 dark:text-orange-500 uppercase tracking-[0.3em] mb-3">
            How We Compare
          </p>
          <h2 className="text-3xl font-bold tracking-tighter text-gray-900 dark:text-white uppercase">
            Feature by feature.
          </h2>
          <p className="text-[11px] font-mono text-gray-500 dark:text-white/40 mt-4 tracking-wide">
            No marketing. Just what each tool actually does.
          </p>
        </div>

        <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-lg">
          <div className="grid grid-cols-5 bg-gray-50 dark:bg-[#080808] border-b border-gray-200 dark:border-white/10">
            <div className="col-span-1 px-5 py-4 text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">
              Feature
            </div>
            {['ScorchPad', 'Pastebin', 'PrivateBin', 'OneTimeSecret'].map((name) => (
              <div
                key={name}
                className={`px-3 py-4 text-center text-[10px] font-bold uppercase tracking-widest ${
                  name === 'ScorchPad'
                    ? 'text-indigo-600 dark:text-orange-500'
                    : 'text-gray-400 dark:text-white/30'
                }`}
              >
                {name}
              </div>
            ))}
          </div>

          {COMPARISON.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-5 border-b border-gray-100 dark:border-white/5 last:border-0 transition-colors ${
                i % 2 === 0
                  ? 'bg-white dark:bg-[#050505]'
                  : 'bg-gray-50/50 dark:bg-[#080808]/60'
              }`}
            >
              <div className="col-span-1 px-5 py-3.5 text-[11px] font-mono text-gray-600 dark:text-white/60 flex items-center">
                {row.feature}
              </div>
              {(
                [row.scorchpad, row.pastebin, row.privatebin, row.onetimesecret] as CellValue[]
              ).map((val, j) => (
                <div
                  key={j}
                  className={`px-3 py-3.5 flex items-center justify-center ${
                    j === 0 ? 'bg-indigo-50/40 dark:bg-orange-500/5' : ''
                  }`}
                >
                  <ComparisonCell value={val} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className="text-[10px] font-mono text-gray-400 dark:text-white/25 mt-4 text-center tracking-wide">
          Comparison based on publicly documented features as of May 2026. "Partial" = feature exists but with meaningful limitations.
        </p>
      </div>

      {/* ── Bottom CTA ── */}
      <div className="w-full max-w-2xl mx-auto px-4 mt-24 text-center">
        <h2 className="text-2xl font-bold tracking-tighter text-gray-900 dark:text-white uppercase mb-4">
          Start for free. Upgrade when you need it.
        </h2>
        <p className="text-[11px] font-mono text-gray-500 dark:text-white/40 leading-relaxed tracking-wide mb-8">
          No credit card required. Free tier includes full zero-knowledge encryption — the same cryptographic guarantee as Pro.
        </p>
        <a
          href="/"
          className="inline-block px-8 py-4 bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-500 text-white rounded-lg font-bold text-[11px] uppercase tracking-[0.2em] transition-all shadow-md dark:shadow-lg dark:shadow-orange-500/20"
        >
          Create Your First Paste
        </a>
      </div>

    </div>
  );
}

