'use client';
import { useState, useEffect, useRef } from 'react';
import { FeatureRow } from './FeatureRow';
import { openCheckout, PlanDuration } from '../../mocks/api.mock';
import { Spinner } from '../ui/Spinner';

const MONTHLY_BASE_INR = 149;
const MONTHLY_BASE_USD = 3;

function getSavingsBadge(plan: PlanDuration | 'free', isIndia: boolean): string | null {
  const monthlyBase = isIndia ? MONTHLY_BASE_INR : MONTHLY_BASE_USD;
  if (plan === 'half-yearly') {
    // FIX BUG-3: was 549 (typo) — actual India half-yearly price is ₹599.
    // Old calculation: (149×6 − 549) / (149×6) = 38.6% → "Save 39%" ← wrong
    // New calculation: (149×6 − 599) / (149×6) = 33.0% → "Save 33%" ← correct
    const fullPrice = isIndia ? 599 : 12;
    const wouldPay = monthlyBase * 6;
    const saving = Math.round(((wouldPay - fullPrice) / wouldPay) * 100);
    return `Save ${saving}%`;
  }
  if (plan === 'annual') {
    const fullPrice = isIndia ? 999 : 24;
    const wouldPay = monthlyBase * 12;
    const saving = Math.round(((wouldPay - fullPrice) / wouldPay) * 100);
    return `Save ${saving}%`;
  }
  return null;
}

function getMonthlyEquivalent(plan: PlanDuration | 'free', isIndia: boolean): string | null {
  if (plan === 'half-yearly') {
    // FIX BUG-3: was '≈ ₹92/mo' which was based on the wrong ₹549 price.
    // Correct: ₹599 ÷ 6 = ≈ ₹100/mo
    return isIndia ? '≈ ₹100/mo' : '≈ $2/mo';
  }
  if (plan === 'annual') return isIndia ? '≈ ₹83/mo' : '≈ $2/mo';
  return null;
}

export function PricingCard({
  plan,
  title,
  price,
  description,
  features,
  isPro,
  isIndia = false,
  region = 'india',
}: {
  plan: PlanDuration | 'free';
  title: string;
  price: string;
  description: string;
  features: { included: boolean; text: string }[];
  isPro: boolean;
  isIndia?: boolean;
  region?: 'india' | 'intl';
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks which region was active when the most recent checkout click fired.
  // Used to guard against a stale promise continuation redirecting the user
  // after they have already switched to the other payment tab.
  const clickedRegionRef = useRef<'india' | 'intl' | null>(null);

  // FIX BUG-1 — shared isLoading state across tab switches.
  //
  // React reuses the same PricingCard component instances when the user
  // toggles the India ↔ International tab — only props change; the component
  // never unmounts. Without this effect, isLoading=true set by a click on the
  // International Annual card persists into the India Annual card, making it
  // appear stuck on "Redirecting…" even though no Razorpay checkout was ever
  // started. The same bug makes the Razorpay card's isLoading bleed into the
  // Lemon Squeezy card when switching the other way.
  //
  // Resetting on region change is the correct fix: when the user switches tabs
  // they are starting a fresh interaction with a different payment provider.
  useEffect(() => {
    setIsLoading(false);
    setError(null);
    clickedRegionRef.current = null;
  }, [region]);

  const handleCheckout = async () => {
    if (plan === 'free' || isLoading) return;

    // Snapshot the region at the moment of the click. The `region` prop can
    // change (tab switch) while the async checkout request is in flight, so we
    // must capture it here rather than reading it from the closure later.
    const regionAtClick = region;
    clickedRegionRef.current = regionAtClick;

    setIsLoading(true);
    setError(null);

    try {
      const { checkoutUrl } = await openCheckout(plan, regionAtClick);

      // If the user switched tabs while the request was in flight, the useEffect
      // above has already reset this card. Abort the redirect silently — the
      // user's intent has changed.
      if (clickedRegionRef.current !== regionAtClick) {
        setIsLoading(false);
        return;
      }

      if (typeof window !== 'undefined') window.location.href = checkoutUrl;
      // Don't reset isLoading on success — the page is navigating away.
      // The button stays in "Redirecting…" state until the navigation completes.
    } catch (err) {
      // FIX BUG-2 — silent failure with no user feedback.
      //
      // The old catch block called setIsLoading(false) and nothing else.
      // When the Lemon Squeezy checkout API fails (wrong variant ID on Vercel,
      // LS account not fully active, network error, etc.) the button silently
      // resets to "Upgrade Now" / "Get Started" with no indication of what went
      // wrong. The user interprets this as "it didn't redirect" and retries in
      // confusion. Surfacing the error message immediately makes the failure
      // visible and actionable.
      setIsLoading(false);
      const message =
        err instanceof Error
          ? err.message
          : 'Checkout is temporarily unavailable. Please try again.';
      setError(message);
    }
  };

  const savingsBadge = getSavingsBadge(plan, isIndia);
  const monthlyEquiv = getMonthlyEquivalent(plan, isIndia);

  const getButtonLabel = () => {
    if (plan === 'free') return 'Current Plan';
    if (isLoading) return null; // Show spinner instead
    return isPro ? 'Upgrade Now' : 'Get Started';
  };

  return (
    <div
      className={`p-8 rounded-2xl border transition-colors relative ${
        isPro
          ? 'border-indigo-500 dark:border-orange-500/50 bg-indigo-50/50 dark:bg-[#0A0A0A] shadow-lg'
          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#050505]'
      }`}
    >
      {isPro && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 dark:bg-orange-600 text-white px-3 py-1 text-[10px] font-bold rounded-full tracking-widest uppercase">
          PRO
        </span>
      )}

      <h3 className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">{title}</h3>
      <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 mt-2 min-h-[30px]">{description}</p>

      <div className="my-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div>
            <span className="text-4xl font-extrabold text-gray-900 dark:text-white">{price}</span>
            {price !== 'Free' && (
              <span className="text-gray-500 dark:text-white/40 font-medium">
                /{plan === 'annual' ? 'yr' : plan === 'half-yearly' ? '6mo' : 'mo'}
              </span>
            )}
          </div>
          {savingsBadge && (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest border border-emerald-200 dark:border-emerald-700/40 self-center">
              {savingsBadge}
            </span>
          )}
        </div>
        {monthlyEquiv && (
          <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 mt-1">{monthlyEquiv}</p>
        )}
      </div>

      {/* Button — mb reduced to mb-3 to leave room for the error row below */}
      <button
        onClick={handleCheckout}
        disabled={isLoading || plan === 'free'}
        className={`w-full py-3 rounded-xl font-bold transition mb-3 uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 ${
          isPro
            ? 'bg-indigo-600 dark:bg-orange-600 text-white hover:bg-indigo-700 dark:hover:bg-orange-500 shadow-md dark:shadow-lg dark:shadow-orange-500/20 disabled:opacity-70 disabled:cursor-not-allowed'
            : 'bg-gray-50 dark:bg-black border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white disabled:opacity-70 disabled:cursor-not-allowed'
        }`}
      >
        {isLoading ? (
          <>
            <Spinner size={12} />
            <span>Redirecting...</span>
          </>
        ) : (
          getButtonLabel()
        )}
      </button>

      {/* Error feedback — replaces the bottom half of the original mb-8 gap.
          min-h ensures the feature list position is stable whether or not
          an error is displayed. */}
      <div className="mb-5 min-h-[20px] flex items-start justify-center">
        {error && (
          <p className="text-[10px] font-mono text-red-500 dark:text-red-400 text-center leading-relaxed px-1">
            {error}
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-4">
        {features.map((f, i) => (
          <FeatureRow key={i} {...f} />
        ))}
      </ul>
    </div>
  );
}
