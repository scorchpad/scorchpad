'use client';
import { usePasteStore } from '../../src/store/pasteStore';
import { useSubscription } from '../../src/hooks/useSubscription';
import { Badge } from '../../src/components/ui/Badge';
import { Spinner } from '../../src/components/ui/Spinner';

export default function DashboardPage() {
  useSubscription();
  const store = usePasteStore();

  let dailyLimit = 3;
  if (store.tier === 'free') dailyLimit = 10;
  if (store.tier === 'pro') {
    if (store.planDuration === 'monthly') dailyLimit = 50;
    else if (store.planDuration === 'half-yearly') dailyLimit = 150;
    else if (store.planDuration === 'annual') dailyLimit = -1;
    else dailyLimit = 50;
  }

  const used = (dailyLimit !== -1) ? dailyLimit - store.pastesRemainingToday : 0;
  const progress = dailyLimit !== -1 ? Math.min(100, (used / dailyLimit) * 100) : 0;

  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">
      <h1 className="text-3xl font-bold tracking-tighter mb-8 text-gray-900 dark:text-white">Dashboard</h1>
      
      {store.isPollingSubscription && (
        <div className="mb-8 p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-orange-600 dark:text-orange-400 font-medium">
            <Spinner /> Activating your plan...
          </div>
          <p className="text-[10px] uppercase tracking-widest text-orange-600/70 dark:text-orange-500/50">This may take a minute.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="p-6 border rounded-xl bg-white dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg transition-colors">
          <h2 className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-[0.2em] mb-4">Subscription</h2>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold uppercase tracking-wider text-gray-900 dark:text-white">{store.tier}</span>
            <Badge variant={store.tier === 'pro' ? 'pro' : 'default'} className="uppercase tracking-widest">{store.tier}</Badge>
          </div>
          {store.planDuration && <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 capitalize mb-4">{store.planDuration} Plan</p>}
          <button className="text-[10px] font-bold tracking-widest uppercase text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors mt-2">Cancel subscription</button>
        </div>

        <div className="p-6 border rounded-xl bg-white dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg transition-colors">
          <h2 className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-[0.2em] mb-4">Daily Usage</h2>
          <div className="mb-2 flex justify-between items-end">
            <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{used}</span>
            <span className="text-[11px] font-mono text-gray-500 dark:text-white/50">/ {dailyLimit === -1 ? 'Unlimited' : dailyLimit} pastes</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-white/5 h-2 rounded-full mt-4 overflow-hidden shadow-inner">
             <div className="bg-indigo-600 dark:bg-orange-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
