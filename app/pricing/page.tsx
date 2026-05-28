'use client';
import { PricingCard } from '../../src/components/pricing/PricingCard';
import { useEffect, useState } from 'react';

export default function PricingPage() {
  // Client-side locale hint for display only.
  // Server enforces actual provider/plan routing via X-Vercel-IP-Country.
  const [isIndia, setIsIndia] = useState(false);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('Asia/Calcutta') || tz.includes('Asia/Kolkata')) {
      setIsIndia(true);
    }
  }, []);

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
    { text: '500 KB max paste size (1 MB Annual)', included: true },
    { text: '50/day (Monthly) · 150/day (Half-Yr) · Unlimited (Annual)', included: true },
    { text: 'Up to 90 days expiry (Annual)', included: true },
    { text: 'Unlimited or custom views (1–9999)', included: true },
    { text: 'Password protection', included: true },
    { text: 'Custom view limits', included: true },
    { text: 'Full syntax highlighting', included: true },
    { text: 'No ads', included: true },
  ];

  return (
    <div className="flex flex-col items-center pt-12 pb-24">
      <div className="text-center max-w-2xl mx-auto mb-16 px-4">
        <h1 className="text-4xl font-bold tracking-tighter mb-4 text-gray-900 dark:text-white uppercase">
          Subscription Plans
        </h1>
        <p className="text-[11px] font-mono text-gray-600 dark:text-white/50 tracking-wide">
          Unlock password protection, custom view counts, and large payloads.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 w-full max-w-7xl mx-auto px-4">
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
          price={isIndia ? '₹299' : '$5'}
          description="Unlock the full power of ScorchPad."
          features={proFeatures}
          isPro={false}
          isIndia={isIndia}
        />

        {/* Half-yearly plan: India only (Razorpay). Hidden for non-IN users. */}
        {isIndia && (
          <PricingCard
            plan="half-yearly"
            title="Pro Half-Yearly"
            price="₹1,499"
            description="6-month plan for power users."
            features={proFeatures}
            isPro={true}
            isIndia={isIndia}
          />
        )}

        <PricingCard
          plan="annual"
          title="Pro Annual"
          price={isIndia ? '₹2,499' : '$49'}
          description="Maximum storage, unlimited pastes."
          features={proFeatures}
          isPro={true}
          isIndia={isIndia}
        />
      </div>
    </div>
  );
}
