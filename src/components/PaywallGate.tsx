// src/components/PaywallGate.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Inline paywall prompt shown when a user attempts a Pro-only feature.
//
// FIX: Changed "Upgrade $5/mo" button to "See pricing" which navigates to
// /pricing. The checkout flow is intentionally separated — users choose their
// plan on the pricing page (monthly / half-yearly / annual) rather than being
// force-pushed into a specific plan from a feature gate popup.
//
// Per spec A.6: PaywallGate must NEVER be a blocking modal. Always inline.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useRouter } from 'next/navigation';

interface PaywallGateProps {
  feature: string;
}

export function PaywallGate({ feature }: PaywallGateProps) {
  const router = useRouter();

  return (
    <div
      role="status"
      aria-label={`${feature} is a Pro feature`}
      className="p-4 bg-indigo-50 dark:bg-orange-950/40 border border-indigo-200 dark:border-orange-500/20 rounded-lg mt-2 transition-colors"
    >
      <h4 className="text-xs font-bold text-indigo-700 dark:text-orange-400 mb-1 tracking-wider uppercase">
        Pro feature required
      </h4>
      <p className="text-[10px] text-indigo-600/80 dark:text-white/50 leading-relaxed mb-3 font-mono">
        {feature} requires a ScorchPad Pro subscription.
      </p>
      <button
        type="button"
        onClick={() => router.push('/pricing')}
        className="w-full py-2 bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-500 text-white text-[10px] font-bold rounded shadow-md dark:shadow-lg dark:shadow-orange-500/20 uppercase tracking-widest transition-colors"
      >
        See pricing
      </button>
    </div>
  );
}
