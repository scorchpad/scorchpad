// src/components/paste/PasteViewer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Decrypts and renders a paste.  Handles all error/loading states.
//
// SYNTAX HIGHLIGHTING (spec Gotcha #12):
//   highlight.js is dynamically imported and applied after decryption.
//   Using highlight.js (not shiki) as required — zero WASM load on viewer path.
//   Only loaded when the paste has a non-null language field.
//
// NEW: "Last view" notification when viewsRemaining === 0 so users understand
//   the paste has been permanently deleted after this view — not just expired.
//
// ─── FIX ─────────────────────────────────────────────────────────────────────
// Extended the error message map to cover the two new ViewerError codes added
// in src/types/index.ts:
//
//   'rate_limited'  — 429: too many requests — inform user and give retry guidance.
//   'server_error'  — 5xx/network — tell user it's transient and suggest retry.
//
// Previously both mapped to the catch-all 'An unexpected error occurred.' in the
// fallback branch; they now have precise, user-friendly messages.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useRef } from 'react';
import { usePasteViewer } from '../../hooks/usePasteViewer';
import { PasswordPrompt } from './PasswordPrompt';
import { ExpiryCountdown } from './ExpiryCountdown';
import { CopyButton } from '../ui/CopyButton';
import { ErrorBoundary } from '../ErrorBoundary';
import { sanitizeHtml, sanitizeString } from '../../lib/sanitize';

// ── Syntax-highlighted code block ─────────────────────────────────────────────

interface CodeBlockProps {
  content:  string;
  language: string | null;
}

function CodeBlock({ content, language }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!language || !codeRef.current) return;

    // Dynamically import highlight.js only when we have a language hint.
    // This keeps highlight.js out of the initial JS bundle entirely.
    let cancelled = false;
    void (async () => {
      try {
        const { default: hljs } = await import('highlight.js/lib/common');
        if (cancelled || !codeRef.current) return;

        // Set the raw text content so hljs can parse it.
        // sanitizeString() already ran on content before this component mounts,
        // so we're setting safe text — hljs will escape it again internally.
        codeRef.current.textContent = content;
        codeRef.current.removeAttribute('data-highlighted'); // allow re-highlight
        hljs.highlightElement(codeRef.current);
      } catch {
        // highlight.js failure is non-fatal — content is still readable as plain text
      }
    })();

    return () => { cancelled = true; };
  }, [content, language]);

  return (
    <pre className="w-full min-h-[400px] p-8 border rounded-xl bg-white dark:bg-[#0d1117] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg overflow-auto text-sm font-mono whitespace-pre-wrap leading-relaxed transition-colors">
      <code
        ref={codeRef}
        className={language ? `language-${language}` : undefined}
      >
        {/* Initial render: plain text. highlight.js overwrites this via useEffect. */}
        {sanitizeString(content)}
      </code>
    </pre>
  );
}

// ── Decrypted content router ───────────────────────────────────────────────────

function DecryptedContent({ content, language }: { content: string; language: string | null }) {
  if (language === 'html') {
    // Sandboxed iframe: sandbox="" = no scripts, no same-origin access, no forms.
    // DOMPurify runs inside sanitizeHtml() — belt-and-suspenders.
    return (
      <iframe
        sandbox=""
        srcDoc={sanitizeHtml(content)}
        title="Paste content"
        className="w-full h-[600px] border border-gray-200 dark:border-white/10 rounded-xl bg-white shadow-sm"
      />
    );
  }

  return <CodeBlock content={content} language={language} />;
}

// ── Error card ─────────────────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="w-full max-w-3xl mx-auto mt-12 p-8 border rounded-xl bg-white dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg text-center transition-colors">
      <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 uppercase tracking-widest">
        {message}
      </p>
    </div>
  );
}

// ── Main viewer ────────────────────────────────────────────────────────────────

export function PasteViewer({ id }: { id: string }) {
  const {
    decryptedContent,
    setDecryptedContent,
    error,
    pasteData,
    isLoading,
  } = usePasteViewer(id);

  if (error) {
    // FIX: Added 'rate_limited' and 'server_error' messages.
    // Previously both fell through to the generic fallback, showing
    // "An unexpected error occurred." for rate-limits and server failures.
    const messages: Record<string, string> = {
      not_found:     'This paste has expired or no longer exists.',
      missing_key:   'Decryption key missing — make sure you have the full URL including the # fragment.',
      decrypt_failed:'Could not decrypt. The link may be incomplete or corrupted.',
      rate_limited:  'Too many requests. Please wait a moment and try again.',
      server_error:  'Something went wrong on our end. Please try refreshing the page.',
    };
    return <ErrorCard message={messages[error] ?? 'An unexpected error occurred.'} />;
  }

  if (isLoading || !pasteData) {
    return (
      <div className="flex justify-center mt-12">
        <div className="animate-pulse w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10" />
      </div>
    );
  }

  if (pasteData.hasPassword && !decryptedContent) {
    if (!pasteData.passwordSalt) {
      return <ErrorCard message="Could not decrypt. The link may be incomplete or corrupted." />;
    }
    return (
      <PasswordPrompt
        id={id}
        passwordSalt={pasteData.passwordSalt}
        onDecrypted={setDecryptedContent}
      />
    );
  }

  if (!decryptedContent) {
    return (
      <div className="flex justify-center mt-12">
        <div className="animate-pulse w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10" />
      </div>
    );
  }

  // viewsRemaining === 0 means this was the last view — paste has been deleted.
  const wasLastView = pasteData.viewsRemaining === 0;

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 flex flex-col gap-4 px-4">

      {/* ── Meta bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4 text-[10px] text-gray-500 dark:text-white/40 uppercase tracking-widest font-mono">
          <ExpiryCountdown expiresAt={pasteData.expiresAt} />
          {pasteData.viewsRemaining > 0 && (
            <span className="text-indigo-600 dark:text-orange-500 font-bold">
              • {pasteData.viewsRemaining} views left
            </span>
          )}
        </div>
        <CopyButton
          textToCopy={decryptedContent}
          className="px-4 py-2 bg-indigo-600 dark:bg-white text-white dark:text-black hover:bg-indigo-700 dark:hover:bg-orange-500 dark:hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm"
        >
          Copy payload
        </CopyButton>
      </div>

      {/* ── Last-view notification ────────────────────────────────────────
           Shown when viewsRemaining === 0 so the viewer knows this paste
           was permanently deleted after their view.                         */}
      {wasLastView && (
        <div
          role="status"
          className="px-4 py-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-500/30 rounded-lg"
        >
          <p className="text-[11px] font-mono text-orange-700 dark:text-orange-400 uppercase tracking-widest">
            🔥 Last view — this paste has been permanently deleted.
          </p>
        </div>
      )}

      {/* ── Decrypted content ─────────────────────────────────────────────
           Wrapped in ErrorBoundary so a crypto/render failure shows a
           graceful error card rather than a white screen.                   */}
      <ErrorBoundary>
        <DecryptedContent content={decryptedContent} language={pasteData.language} />
      </ErrorBoundary>
    </div>
  );
}
