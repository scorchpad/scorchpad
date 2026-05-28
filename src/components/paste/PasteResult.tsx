'use client';
import { usePasteStore } from '../../store/pasteStore';
import { CopyButton } from '../ui/CopyButton';
import { buildShareableLink, buildPasswordShareableLink } from '../../lib/urlFragment';

export function PasteResult() {
  const store = usePasteStore();
  
  if (!store.createdId) return null;

  // Build the share URL. Standard pastes embed the key in the fragment.
  // Resolve to null if createdKey is missing (bad state) — render nothing rather than assert.
  const shareUrl = store.isPasswordPaste
    ? buildPasswordShareableLink(store.createdId)
    : store.createdKey
      ? buildShareableLink(store.createdId, store.createdKey)
      : null;

  if (!shareUrl) return null;

  return (
    <div className="p-8 border rounded-xl bg-gray-50 dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg mt-8 w-full max-w-2xl mx-auto transition-colors">
      <h2 className="text-xl font-bold tracking-tighter mb-6 text-gray-900 dark:text-white uppercase">Payload Armed & Ready</h2>
      
      <div className="flex gap-2 items-center justify-between w-full p-1.5 bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-xl mb-6 shadow-inner">
        <input 
          readOnly 
          value={shareUrl}
          className="flex-1 px-4 text-xs font-mono text-gray-600 dark:text-white/50 bg-transparent border-none outline-none select-all w-full min-w-0"
          onFocus={(e) => e.target.select()}
        />
        <CopyButton textToCopy={shareUrl} className="px-6 py-2.5 bg-indigo-600 dark:bg-white text-white dark:text-black text-[10px] font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-500 dark:hover:text-white transition-all uppercase tracking-widest shrink-0 flex items-center justify-center gap-2">
          COPY LINK
        </CopyButton>
      </div>

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
        onClick={store.resetCreate}
        className="text-[10px] text-gray-500 dark:text-white/40 hover:text-indigo-600 dark:hover:text-white font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
      >
        <span className="text-indigo-600 dark:text-orange-500">←</span> INITIALIZE NEW PASTE
      </button>
    </div>
  );
}
