import type { Metadata } from 'next';
import PricingClientPage from '../../src/components/pricing/PricingClientPage';

// Statically pre-generate at build time — makes page immediately crawlable
// by AI agents and search engines without hitting the Next.js server runtime.
// PricingClientPage is 'use client' and handles the region toggle interactivity.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ScorchPad subscription plans. Free tier includes full AES-256-GCM zero-knowledge encryption. ' +
    'Pro unlocks password protection, custom view limits, larger paste sizes, and extended expiry. ' +
    'India pricing via Razorpay (INR). International pricing via Lemon Squeezy (USD).',
  robots: { index: true, follow: true },
  alternates: {
    types: {
      'text/plain': 'https://scorchpad.rsaatlabs.com/llms-full.txt',
    },
  },
};

export default function PricingPage() {
  return <PricingClientPage />;
}
