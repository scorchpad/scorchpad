// src/components/paste/PasteResult.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shown after successful paste creation. Displays the shareable link.
//
// FIX: Burn-after-reading (maxViews=1) pastes now show a prominent red
// warning explaining that the link self-destructs after ONE view by ANYONE
// (including the creator). Previously users accidentally opened their own link
// before sending it to the recipient, consuming the one allowed view and
// causing "This paste has expired or no longer exists" for the recipient.
//
// CLIPBOARD PERMISSION:
// For key-in-URL pastes, the auto-clear feature (overwriting the clipboard
// after 30s) requires the clipboard-write permission. We:
//   1. Show a pre-emptive notice explaining why we need the permission,
//      so the browser prompt makes sense when it appears.
//   2. If the user denies (or has previously denied) permission, replace
//      the notice with a red warning box and a "Grant clipboard access"
//      button that re-triggers the browser permission prompt via a fresh
//      user-gesture-bound writeText() call.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { usePasteStore } from '../../store/pasteStore';
import { CopyButton } from '../ui/CopyButton';
import { buildShareableLink, buildPasswordShareableLink } from '../../lib/urlFragment';

export function PasteResult() {
  const store = usePasteStore();
  const [clipboardDenied, setClipboardDenied] = useState(false);

  if (!store.createdId) return null;

  const shareUrl = store.isPasswordPaste
    ? buildPasswordShareableLink(store.createdId)
    : store.createdKey
      ? buildShareableLink(store.createdId, store.createdKey)
      : null;

  if (!shareUrl) return null;

  const isBurnAfterReading = store.maxViews === 1 && !store.isPasswordPaste;
  const isKeyUrl = shareUrl.includes('#');

  // Called when the user clicks "Grant clipboard access".
  // Calling writeText() on a user gesture re-triggers the browser permission
  // prompt even after a previous denial. If they click Allow, the promise
  // resolves and setClipboardDenied(false) clears the warning.
  const handleRequestPermission = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setClipboardDenied(false);
    } catch {
      // Still denied or user dismissed — warning stays visible.
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
          onPermissionDenied={isKeyUrl ? setClipboardDenied : undefined}
          className="px-6 py-2.5 bg-indigo-600 dark:bg-white text-white dark:text-black text-[10px] font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-500 dark:hover:text-white transition-all uppercase tracking-widest shrink-0 flex items-center justify-center gap-2"
        >
          COPY LINK
        </CopyButton>
      </div>

      {/* ── Pre-permission notice ─────────────────────────────────────────
           Shown before the user has interacted with the copy button (or
           after a successful grant). Explains why we need clipboard access
           so the browser prompt doesn't appear out of nowhere.            */}
      {isKeyUrl && !clipboardDenied && (
        <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 leading-relaxed mb-4 px-1">
          🔒 Clicking{' '}
          <strong className="text-gray-600 dark:text-white/50">COPY LINK</strong> will
          request clipboard access so ScorchPad can automatically erase the
          decryption key from your clipboard after 30 seconds.
        </p>
      )}

      {/* ── Clipboard permission denied warning ───────────────────────────
           Shown when the user denies (or has previously denied) the prompt.
           The "Grant clipboard access" button calls writeText() on a user
           gesture, which re-triggers Chrome's permission prompt.          */}
      {isKeyUrl && clipboardDenied && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-500/40 p-4 mb-4 rounded-lg"
        >
          <p className="text-[11px] font-mono font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">
            ⚠️ Clipboard access denied
          </p>
          <p className="text-[11px] font-mono text-red-600/80 dark:text-red-300/70 leading-relaxed mb-3">
            ScorchPad cannot automatically clear the decryption key from your
            clipboard after 30 seconds. This key grants full access to your
            paste — make sure you clear your clipboard manually before closing
            this tab or sharing your screen, and ensure this key reaches no one
            unintended.
          </p>
          <button
            onClick={handleRequestPermission}
            className="text-[10px] font-mono font-bold uppercase tracking-widest px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            Grant clipboard access
          </button>
        </div>
      )}

      {/* ── Burn-after-reading: prominent warning ─────────────────────────
           This is the most common source of confusion: the creator opens
           the link themselves to test it, which burns the paste before the
           recipient sees it. The warning is styled more aggressively than
           the general share-carefully notice below.                        */}
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
