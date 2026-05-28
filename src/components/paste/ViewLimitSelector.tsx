'use client';
import { usePasteStore } from '../../store/pasteStore';
import { PaywallGate } from '../PaywallGate';

// Free tier shows a simple dropdown.
const PRESETS_FREE = [
  { l: '1 view (Burn)', v: 1 },
  { l: '5 views', v: 5 },
  { l: '10 views', v: 10 },
];

// Pro tier shows individual quick-select buttons (per spec) plus a custom input.
const PRESETS_PRO = [
  { l: '1', v: 1 },
  { l: '5', v: 5 },
  { l: '10', v: 10 },
  { l: '25', v: 25 },
  { l: '50', v: 50 },
  { l: '100', v: 100 },
  { l: '∞', v: 0 },
];

export function ViewLimitSelector() {
  const store = usePasteStore();
  const isPro = store.tier === 'pro';

  // Validates the custom input per Gotcha #15:
  // Accept 0 (unlimited) or integers 1–9999. Reject floats, negatives, > 9999.
  const customValueError = (() => {
    if (!store.useCustomViews || store.customViewsInput === '') return null;
    const raw = store.customViewsInput.trim();
    // FIX: Check raw string before parsing — parseInt("1.5") silently returns 1,
    // bypassing the float rejection required by Gotcha #15.
    // /^\d+$/ ensures only whole non-negative integers pass; Number() then gives
    // exact value without truncation, so "1.5" is correctly rejected here.
    if (!/^\d+$/.test(raw)) {
      return 'Enter 0 for unlimited, or a whole number 1–9999.';
    }
    const parsed = Number(raw);
    if (parsed > 9999) {
      return 'Enter 0 for unlimited, or a whole number 1–9999.';
    }
    return null;
  })();

  const handlePresetSelect = (v: number) => {
    store.setUseCustomViews(false);
    store.setCustomViewsInput('');
    store.setMaxViews(v);
  };

  const handleCustomFocus = () => {
    store.setUseCustomViews(true);
  };

  // Which preset button (if any) is currently active
  const activePreset = !store.useCustomViews ? store.maxViews : null;

  if (!isPro) {
    // Anonymous: 1 view only (spec A.7 — "Anonymous: 1 only").
    // Free: 1, 5, 10 views (dropdown).
    const isAnonymous = store.tier === 'anonymous';

    if (isAnonymous) {
      // Force maxViews to 1 — anonymous users have no choice here.
      // setMaxViews to 1 if somehow different (e.g. after a tier downgrade).
      if (store.maxViews !== 1) store.setMaxViews(1);
      return (
        <div className="flex flex-col gap-2">
          <label className="block text-xs text-gray-600 dark:text-white/70 font-medium tracking-wide">
            Max views
          </label>
          <div className="w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded px-3 py-2.5 text-xs text-gray-500 dark:text-white/40 flex items-center justify-between">
            <span>1 view (burn after reading)</span>
            <span className="text-[10px] uppercase tracking-widest text-indigo-500 dark:text-orange-500 font-bold">Anonymous</span>
          </div>
          <p className="text-[10px] font-mono text-gray-400 dark:text-white/30 tracking-wide">
            Sign up for free to unlock more options.
          </p>
        </div>
      );
    }

    // Free tier: simple dropdown with 1, 5, 10 options.
    return (
      <div className="flex flex-col gap-2">
        <label className="block text-xs text-gray-600 dark:text-white/70 font-medium tracking-wide">
          Max views
        </label>
        <select
          value={store.maxViews}
          onChange={(e) => {
            store.setUseCustomViews(false);
            store.setMaxViews(Number(e.target.value));
          }}
          className="w-full bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded px-3 py-2.5 text-xs text-gray-900 dark:text-white/90 focus:outline-none focus:border-indigo-500 dark:focus:border-orange-500/50 transition-colors"
        >
          {PRESETS_FREE.map((opt) => (
            <option key={opt.v} value={opt.v}>
              {opt.l}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Pro: quick-select buttons + custom number input (per spec A.6)
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-xs text-gray-600 dark:text-white/70 font-medium tracking-wide">
        Max views
      </label>

      {/* Quick-select preset buttons */}
      <div className="flex flex-wrap gap-1">
        {PRESETS_PRO.map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => handlePresetSelect(opt.v)}
            className={`px-2.5 py-1.5 rounded text-[11px] font-bold border transition-colors ${
              activePreset === opt.v
                ? 'bg-indigo-600 dark:bg-orange-600 text-white border-indigo-600 dark:border-orange-600'
                : 'bg-white dark:bg-black border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:border-indigo-500 dark:hover:border-orange-500/60 hover:text-indigo-600 dark:hover:text-orange-400'
            }`}
            title={opt.v === 0 ? 'Unlimited views' : `${opt.v} view${opt.v !== 1 ? 's' : ''}`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {/* Custom number input — clears active preset on focus */}
      <div className="flex items-center gap-2 mt-1">
        <input
          type="number"
          min="0"
          max="9999"
          step="1"
          value={store.useCustomViews ? store.customViewsInput : ''}
          onChange={(e) => {
            store.setUseCustomViews(true);
            store.setCustomViewsInput(e.target.value);
          }}
          onFocus={handleCustomFocus}
          placeholder="Custom (0–9999)"
          className={`w-full bg-white dark:bg-black border rounded px-3 py-2 text-xs text-gray-900 dark:text-white/90 focus:outline-none transition-colors ${
            store.useCustomViews
              ? 'border-indigo-500 dark:border-orange-500/60'
              : 'border-gray-200 dark:border-white/10 focus:border-indigo-500 dark:focus:border-orange-500/50'
          }`}
        />
      </div>

      {store.useCustomViews && customValueError && (
        <p className="text-[10px] text-red-600 dark:text-red-500 font-mono tracking-wide">
          {customValueError}
        </p>
      )}

      {/* Guard: free/anon user who somehow reaches custom input */}
      {store.useCustomViews && !isPro && (
        <PaywallGate feature="Custom view counts" />
      )}
    </div>
  );
}
