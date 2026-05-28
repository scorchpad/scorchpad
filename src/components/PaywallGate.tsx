'use client';
import { openCheckout } from '../mocks/api.mock';

export function PaywallGate({ feature }: { feature: string }) {
  const handleUpgrade = async () => {
    try {
      const { checkoutUrl } = await openCheckout('monthly');
      if (typeof window !== 'undefined') window.location.href = checkoutUrl;
    } catch {}
  };
  return (
    <div className="p-4 bg-indigo-50 dark:bg-orange-950/40 border border-indigo-200 dark:border-orange-500/20 rounded-lg mt-2 transition-colors">
      <h4 className="text-xs font-bold text-indigo-700 dark:text-orange-400 mb-1 tracking-wider uppercase">PRO FEATURE REQUIRED</h4>
      <p className="text-[10px] text-indigo-600/80 dark:text-white/50 leading-relaxed mb-3 font-mono">{feature} requires a Scorch Pro license.</p>
      <button 
        onClick={handleUpgrade}
        className="w-full py-2 bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-500 text-white text-[10px] font-bold rounded shadow-md dark:shadow-lg dark:shadow-orange-500/20 uppercase tracking-widest transition-colors"
      >
        Upgrade $5/mo
      </button>
    </div>
  );
}
