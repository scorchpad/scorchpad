// src/components/paste/PasteResult.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shown after successful paste creation. Displays the shareable link.
//
// Clipboard permission states (null | false | true):
//   null  → user hasn't clicked COPY yet          → show grey notice
//   false → copy succeeded, auto-clear is running  → show countdown only
//   true  → clipboard access denied               → show red warning box
//
// Chrome auto-grants clipboard-write on user gesture. The denied state only
// triggers if the site is blocked under Site Settings → Clipboard, or if the
// tab loses focus between copy and auto-clear.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useCallback, useState } from 'react';
import { usePasteStore } from '../../store/pasteStore';
import { CopyButton } from '../ui/CopyButton';
import { buildShareableLink, buildPasswordShareableLink } from '../../lib/urlFragment';

export function PasteResult() {
  const store = usePasteStore();

  // null  = not yet interacted  → show pre-copy notice
  // false = copy succeeded      → hide notice, show countdown
  // true  = access denied       → show red warning box
  const [clipboardDenied, setClipboardDenied] = useState<boolean | null>(null);

  // Stable reference so CopyButton's useEffect doesn't re-run every render.
  const handlePermissionDenied = useCallback((denied: boolean) => {
    setClipboardDenied(denied);
  }, []);

  if (!store.createdId) return null;

  const shareUrl = store.isPasswordPaste
    ? buildPasswordShareableLink(store.createdId)
    : store.createdKey
      ? buildShareableLink(store.createdId, store.createdKey)
      : null;

  if (!shareUrl) return null;

  const isBurnAfterReading = store.maxViews === 1 && !store.isPasswordPaste;
  const isKeyUrl = shareUrl.includes('#');

  // Clicking this button calls writeText() on a fresh user gesture.
  // In Chrome this re-triggers the Site Settings permission check —
  // if they unblocked clipboard in site settings, this will now succeed
  // and clear the warning. If still blocked, the warning stays.
  const handleRequestPermission = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setClipboardDenied(false);
    } catch {
      // Still denied — warning stays.
    }
  };

  return (
    <div className="p-8 border rounded-xl bg-gray-50 dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg mt-8 w-full max-w-2xl mx-auto transition-colors">
      <h2 className="text-xl font-bold tracking-tighter mb-6 text-gray-900 dark:text-white uppercase">
        Payload Armed &amp; Ready
      </h2>

      {/* ── Share URL ────────────────────────────────────────────────────── */}
      <div className="flex gap-2 items-center justify-between w-full p-1.5 bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-xl mb-3 shadow-inner">
        <input
          readOnly
          value={shareUrl}
          aria-label="Shareable link"
          className="flex-1 px-4 text-xs font-mono text-gray-600 dark:text-white/50 bg-transparent border-none outline-none select-all w-full min-w-0"
          onFocus={(e) => e.target.select()}
        />
        <CopyButton
          textToCopy={shareUrl}
          onPermissionDenied={isKeyUrl ? handlePermissionDenied : undefined}
          className="px-6 py-2.5 bg-indigo-600 dark:bg-white text-white dark:text-black text-[10px] font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-500 dark:hover:text-white transition-all uppercase tracking-widest shrink-0 flex items-center justify-center gap-2"
        >
          COPY LINK
        </CopyButton>
      </div>

      {/* ── Pre-copy notice ───────────────────────────────────────────────
           Only shown before the user clicks COPY. Explains the auto-clear.
           Disappears as soon as copy is attempted (success or failure).   */}
      {isKeyUrl && clipboardDenied === null && (
        <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 leading-relaxed mb-4 px-1">
          🔒 ScorchPad will automatically erase the decryption key from your
          clipboard 30 seconds after you copy — so clipboard managers or shared
          screens cannot expose it.
        </p>
      )}

      {/* ── Clipboard access denied warning ───────────────────────────────
           Shown when writeText() throws NotAllowedError — meaning the site
           is blocked under Chrome → Site Settings → Clipboard (or the tab
           lost focus between copy and auto-clear at T=30s).
           "Request clipboard permission" retries writeText() on a fresh
           user gesture, which re-evaluates site permissions without
           requiring the user to navigate to site settings.               */}
      {isKeyUrl && clipboardDenied === true && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-500/40 p-4 mb-4 rounded-lg"
        >
          <p className="text-[11px] font-mono font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">
            ⚠️ Clipboard access not granted
          </p>
          <p className="text-[11px] font-mono text-red-600/80 dark:text-red-300/70 leading-relaxed mb-3">
            You have not given ScorchPad access to your clipboard. The
            decryption key will <strong>not</strong> be automatically cleared
            after 30 seconds — make sure you clear your clipboard manually and
            ensure this key does not leak to anyone.
          </p>
          <button
            onClick={handleRequestPermission}
            className="text-[10px] font-mono font-bold uppercase tracking-widest px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            Request clipboard permission
          </button>
        </div>
      )}

      {/* ── Burn-after-reading warning ────────────────────────────────────
           Most common confusion: creator opens link themselves, burns it
           before recipient sees it.                                        */}
      {isBurnAfterReading && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-500/40 p-4 mb-4 rounded-lg"
        >
          <p className="text-[11px] font-mono font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">
            🔥 Burn-after-reading — one view only
          </p>
          <p className="text-[11px] font-mono text-red-600/80 dark:text-red-300/70 leading-relaxed">
            This link self-destructs permanently after the <strong>first</strong> view by
            anyone — including you. Do <strong>not</strong> open this link yourself.
            Copy it and send it directly to your recipient.
          </p>
        </div>
      )}

      {/* ── General share-carefully warning (always shown) ────────────── */}
      <div className="bg-yellow-50 dark:bg-orange-950/20 border border-yellow-200 dark:border-orange-500/20 p-4 mb-6 rounded">
        <p className="text-[11px] font-mono text-yellow-800 dark:text-orange-400 uppercase tracking-wide">
          ⚠️ Share this link carefully. Anyone with the full URL can read this paste.
        </p>
        {store.isPasswordPaste && (
          <p className="text-[11px] font-mono text-yellow-600 dark:text-white/50 mt-2">
            Share this link and tell the recipient the password through a separate channel.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={store.resetCreate}
        className="text-[10px] text-gray-500 dark:text-white/40 hover:text-indigo-600 dark:hover:text-white font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
      >
        <span className="text-indigo-600 dark:text-orange-500">←</span> Initialize new paste
      </button>
    </div>
  );
}
