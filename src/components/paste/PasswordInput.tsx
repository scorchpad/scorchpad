'use client';
import { usePasteStore } from '../../store/pasteStore';
import { PaywallGate } from '../PaywallGate';

export function PasswordInput() {
  const store = usePasteStore();
  const isPro = store.tier === 'pro';

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/70 font-medium tracking-wide cursor-pointer mt-0">
        <input
          type="checkbox"
          checked={store.hasPassword}
          onChange={(e) => store.setHasPassword(e.target.checked)}
          className="rounded border-gray-300 dark:border-white/10 bg-white dark:bg-black w-4 h-4 text-indigo-600 dark:text-orange-500 focus:ring-indigo-500 dark:focus:ring-orange-500 accent-indigo-600 dark:accent-orange-500"
        />
        Require password to view
      </label>
      {store.hasPassword && (
        isPro ? (
          // FIX: type="password" — was type="text", which showed the password in plaintext!
          <input
            type="password"
            placeholder="Enter a strong password"
            value={store.passwordPlaintext}
            onChange={(e) => store.setPasswordPlaintext(e.target.value)}
            className="w-full bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-xs text-gray-900 dark:text-white/90 focus:outline-none focus:border-indigo-500 focus:dark:border-orange-500/50 transition-colors mt-2"
          />
        ) : (
          <div className="mt-2 text-xs">
            <PaywallGate feature="Password protection" />
          </div>
        )
      )}
    </div>
  );
}
