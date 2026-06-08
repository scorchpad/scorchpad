'use client';
import { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Copies text to the clipboard with an iOS Safari fallback.
 *
 * navigator.clipboard is unavailable in:
 *   - iOS Safari < 13.4
 *   - Non-secure contexts (http://)
 *   - Some WebViews
 *
 * Fallback: create an off-screen textarea, select its content,
 * and call document.execCommand('copy') — supported everywhere.
 *
 * Auto-clear: if the copied text contains a '#' fragment (i.e. it
 * carries the decryption key), the clipboard is overwritten with ''
 * after 30 seconds to protect against clipboard managers logging the key.
 *
 * Permission awareness: for key URLs, the component checks the
 * clipboard-write permission on mount so a denial warning can be shown
 * immediately if the user previously blocked access. The onPermissionDenied
 * callback notifies the parent so it can render the appropriate UI.
 */
function copyToClipboardWithFallback(text: string): Promise<void> {
  // Prefer the modern async API when available.
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    return navigator.clipboard.writeText(text);
  }

  // Legacy fallback — synchronous execCommand path.
  return new Promise<void>((resolve, reject) => {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      // Place off-screen and prevent scroll jump.
      el.setAttribute('readonly', '');
      el.style.cssText =
        'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(el);

      // On iOS, selection works differently — use setSelectionRange.
      if (navigator.userAgent.match(/ipad|iphone/i)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        el.setSelectionRange(0, 999_999);
      } else {
        el.select();
      }

      const success = document.execCommand('copy');
      document.body.removeChild(el);
      success ? resolve() : reject(new Error('execCommand copy failed'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Copy failed'));
    }
  });
}

export function CopyButton({
  textToCopy,
  className,
  children,
  onPermissionDenied,
}: {
  textToCopy: string;
  className?: string;
  children?: React.ReactNode;
  /** Called with true when clipboard access is denied, false when it is granted. */
  onPermissionDenied?: (denied: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [clearCountdown, setClearCountdown] = useState<number | null>(null);

  const isKeyUrl = textToCopy.includes('#');

  // Check clipboard permission state on mount so the warning shows immediately
  // if the user previously denied access in this browser. Also wires up a
  // change listener so the warning clears if they allow it via site settings.
  useEffect(() => {
    if (!isKeyUrl || typeof navigator === 'undefined' || !navigator.permissions) return;

    navigator.permissions
      .query({ name: 'clipboard-write' as PermissionName })
      .then((result) => {
        if (result.state === 'denied') onPermissionDenied?.(true);

        result.addEventListener('change', () => {
          onPermissionDenied?.(result.state === 'denied');
        });
      })
      .catch(() => {
        // Permissions API not supported (e.g. Firefox) — proceed normally.
      });
  }, [isKeyUrl, onPermissionDenied]);

  const handleCopy = async () => {
    try {
      await copyToClipboardWithFallback(textToCopy);
      setCopied(true);
      onPermissionDenied?.(false); // clear any previous denial state
      setTimeout(() => setCopied(false), 2000);

      // Auto-clear after 30s for URLs that carry the decryption key in the fragment.
      if (isKeyUrl) {
        setClearCountdown(30);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        // User explicitly denied the clipboard permission prompt.
        onPermissionDenied?.(true);
      }
      // Copy failed — log to console, do not surface raw error to UI.
      console.error('[CopyButton] copy failed:', err);
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (clearCountdown !== null) {
      if (clearCountdown > 0) {
        timer = setTimeout(
          () => setClearCountdown((prev) => (prev !== null ? prev - 1 : 0)),
          1000
        );
      } else {
        // Overwrite clipboard — clear the decryption key.
        copyToClipboardWithFallback('').catch(() => {});
        setClearCountdown(null);
      }
    }
    return () => clearTimeout(timer);
  }, [clearCountdown]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        className={
          className ??
          'p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white flex items-center gap-2'
        }
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check size={14} className="text-emerald-600 dark:text-emerald-500" />
        ) : (
          <Copy size={14} />
        )}
        {children ?? (
          <span className="hidden sm:inline">{copied ? 'COPIED' : ''}</span>
        )}
      </button>
      {clearCountdown !== null && (
        <span className="text-[10px] text-orange-600 dark:text-orange-500 font-mono tracking-widest uppercase">
          Expunges in {clearCountdown}s
        </span>
      )}
    </div>
  );
}
