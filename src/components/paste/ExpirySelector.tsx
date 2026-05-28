'use client';
import { usePasteStore } from '../../store/pasteStore';

// 5min, 1h, 24h, 7d, 30d, 90d expressed in seconds
const OPTIONS = [
  { label: '5 minutes', value: 300, minExpiryThreshold: 300 },
  { label: '1 hour', value: 3600, minExpiryThreshold: 3600 },
  { label: '24 hours', value: 86400, minExpiryThreshold: 86400 },
  { label: '7 days', value: 604800, minExpiryThreshold: 604800 },
  { label: '30 days', value: 2592000, minExpiryThreshold: 2592000 },
  { label: '90 days', value: 7776000, minExpiryThreshold: 7776000 },
];

export function ExpirySelector() {
  const store = usePasteStore();
  const allowedOptions = OPTIONS.filter(o => o.minExpiryThreshold <= store.maxExpiry);

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-xs text-gray-600 dark:text-white/70 font-medium tracking-wide">Expire after</label>
      <select 
        value={store.expirySeconds} 
        onChange={(e) => store.setExpiry(Number(e.target.value))}
        className="w-full bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded px-3 py-2.5 text-xs text-gray-900 dark:text-white/90 focus:outline-none focus:border-indigo-500 focus:dark:border-orange-500/50 transition-colors"
      >
        {allowedOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
