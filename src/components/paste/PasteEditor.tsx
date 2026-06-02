// src/components/paste/PasteEditor.tsx
// Main create-paste UI: textarea + collapsible options panel.
//
// CHANGELOG (this version):
//   FIX: Error state changed from `string` to `React.ReactNode` so the
//   error banner can render inline JSX (sign-in / upgrade links).
//
//   FIX: submit() now narrows ApiError by .status and renders:
//     429 → server message + human retry countdown + CTA:
//           anonymous  → "Sign in" link (10/day)
//           free       → "Upgrade to Pro" link (50+/day)
//           pro        → "retry in X min" only
//     403 → server message + "Upgrade to Pro →" link when upgradeUrl present
//     other ApiError → server message (body.error, not "API error {status}")
//
//   WHY REACT.NODE: The sign-in / upgrade CTAs must be tappable links,
//   not plain text. A single `string` state cannot hold JSX. Changing to
//   ReactNode allows the banner to render both text and anchor elements
//   without adding a second state variable or a separate "action" state.
//
// About "Syntax language": this IS a spec-required feature (spec A.6,
// Gotcha #12). It stores the programming language as unencrypted metadata
// alongside the encrypted blob. On the viewer page, highlight.js uses it
// for syntax coloring. It is NOT AI slop — it is intentional and documented.

'use client';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePasteStore } from '../../store/pasteStore';
import { usePasteCreator } from '../../hooks/usePasteCreator';
import { useSubscription } from '../../hooks/useSubscription';
import { ApiError } from '../../mocks/api.mock';
import { ExpirySelector } from './ExpirySelector';
import { ViewLimitSelector } from './ViewLimitSelector';
import { PasswordInput } from './PasswordInput';
import { PasteResult } from './PasteResult';
import { Spinner } from '../ui/Spinner';
import { PaywallGate } from '../PaywallGate';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Syntax language options for code pastes.
// Stored in Redis as unencrypted metadata — not sensitive.
// Language hint passed to highlight.js on the viewer page (Gotcha #12).
const LANGUAGE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Plain text (default)', value: '' },
  { label: 'TypeScript',           value: 'typescript' },
  { label: 'JavaScript',           value: 'javascript' },
  { label: 'Python',               value: 'python' },
  { label: 'Rust',                 value: 'rust' },
  { label: 'Go',                   value: 'go' },
  { label: 'Java',                 value: 'java' },
  { label: 'C / C++',              value: 'cpp' },
  { label: 'C#',                   value: 'csharp' },
  { label: 'Bash / Shell',         value: 'bash' },
  { label: 'SQL',                  value: 'sql' },
  { label: 'JSON',                 value: 'json' },
  { label: 'YAML',                 value: 'yaml' },
  { label: 'HTML',                 value: 'html' },
  { label: 'CSS',                  value: 'css' },
  { label: 'Markdown',             value: 'markdown' },
  { label: 'Dockerfile',           value: 'dockerfile' },
  { label: 'Ruby',                 value: 'ruby' },
  { label: 'PHP',                  value: 'php' },
  { label: 'Swift',                value: 'swift' },
  { label: 'Kotlin',               value: 'kotlin' },
];

// Per-tier paste size ceilings (bytes) — matches plan-limits.ts
const SIZES = {
  anonymous:    10_240,   // 10 KB
  free:         51_200,   // 50 KB
  pro_standard: 524_288,  // 500 KB
  pro_annual:   1_048_576, // 1 MB
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formats seconds into a short human-readable string: "2 min", "3 hr", etc. */
function formatRetryDelay(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.ceil(mins / 60);
  return `${hrs} hr`;
}

/**
 * Maps an ApiError thrown by createPaste() to a ReactNode for the error banner.
 *
 * 429 RATE LIMIT:
 *   The server's `body.error` is now the actual message (e.g. "Daily paste
 *   limit reached.") instead of "API error 429". We append a retry countdown
 *   from ApiError.retryAfter, and an inline CTA link:
 *     anonymous → /sign-up  (free tier = 10/day)
 *     free      → /pricing  (Pro = 50+/day)
 *     pro       → no link, just the retry time
 *
 * 403 FEATURE GATE:
 *   The server already returns a human-readable message for each gate
 *   (e.g. "Password protection requires a Pro subscription."). We append
 *   an "Upgrade to Pro →" link when ApiError.upgradeUrl is present.
 *
 * OTHER:
 *   Use the server's message if available (ApiError.message has body.error
 *   since the api.mock.ts fix). Fall back to a generic message.
 */
function buildErrorNode(
  err: unknown,
  tier: 'anonymous' | 'free' | 'pro',
): ReactNode {
  if (!(err instanceof ApiError)) {
    return err instanceof Error
      ? err.message
      : 'Something went wrong. Please try again.';
  }

  switch (err.status) {
    case 429: {
      // ── Rate limit hit ──────────────────────────────────────────────────
      const retryText = err.retryAfter
        ? `Try again in ~${formatRetryDelay(err.retryAfter)}.`
        : 'Please wait before trying again.';

      if (tier === 'anonymous') {
        // Anonymous → nudge to sign up (10 free pastes/day)
        const ctaHref = err.signUpUrl ?? '/sign-up';
        return (
          <>
            {err.message} {retryText}{' '}
            <Link
              href={ctaHref}
              className="underline font-bold hover:opacity-80 transition-opacity"
            >
              Sign in
            </Link>
            {' '}for 10 free pastes/day.
          </>
        );
      }

      if (tier === 'free') {
        // Free → nudge to upgrade (50+/day Pro)
        const ctaHref = err.upgradeUrl ?? '/pricing';
        return (
          <>
            {err.message} {retryText}{' '}
            <Link
              href={ctaHref}
              className="underline font-bold hover:opacity-80 transition-opacity"
            >
              Upgrade to Pro
            </Link>
            {' '}for 50+ pastes/day.
          </>
        );
      }

      // Pro → they've hit their plan cap; just show retry time
      return <>{err.message} {retryText}</>;
    }

    case 403: {
      // ── Tier feature gate ───────────────────────────────────────────────
      if (err.upgradeUrl) {
        return (
          <>
            {err.message}{' '}
            <Link
              href={err.upgradeUrl}
              className="underline font-bold hover:opacity-80 transition-opacity"
            >
              Upgrade to Pro →
            </Link>
          </>
        );
      }
      // upgradeUrl may be absent (e.g. anon burn-after-reading gate has signUpUrl)
      if (err.signUpUrl) {
        return (
          <>
            {err.message}{' '}
            <Link
              href={err.signUpUrl}
              className="underline font-bold hover:opacity-80 transition-opacity"
            >
              Sign up →
            </Link>
          </>
        );
      }
      return <>{err.message}</>;
    }

    default:
      // Any other ApiError (400, 413, 5xx …): show the server message.
      return <>{err.message}</>;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PasteEditor() {
  const store = usePasteStore();
  const { handleCreate, creatingStep } = usePasteCreator();

  // Load the user's subscription on the home page so ExpirySelector
  // shows the correct options for free and pro users.
  useSubscription();

  // ReactNode (not string) so the error banner can render inline links.
  // null = no error; rendered conditionally below.
  const [error, setError] = useState<ReactNode>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isAnnualPro = store.tier === 'pro' && store.planDuration === 'annual';
  const maxSize =
    store.tier === 'pro'
      ? isAnnualPro ? SIZES.pro_annual : SIZES.pro_standard
      : store.tier === 'free'
      ? SIZES.free
      : SIZES.anonymous;

  const [byteCount, setByteCount] = useState(0);

  useEffect(() => {
    setByteCount(new TextEncoder().encode(store.plaintext).byteLength);
  }, [store.plaintext]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  if (store.createdId) {
    return <PasteResult />;
  }

  const isOverLimit = byteCount > maxSize;

  const submit = async () => {
    setError(null);

    if (isOverLimit) {
      setError('Paste exceeds the size limit for your plan.');
      return;
    }

    try {
      await handleCreate();
    } catch (err: unknown) {
      // buildErrorNode maps ApiError subtypes to contextual messages with CTA links.
      // For non-ApiError instances (e.g. crypto failures), it falls back to err.message.
      setError(buildErrorNode(err, store.tier));
    }
  };

  const buttonLabel = () => {
    if (!store.isCreating) return 'Create Secure Link';
    if (creatingStep === 'deriving')  return 'Deriving key…';
    if (creatingStep === 'uploading') return 'Uploading…';
    return 'Encrypting…';
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto mt-4 px-2">
      {/* ── HERO: textarea ── */}
      <div className="relative w-full">
        <textarea
          ref={textareaRef}
          value={store.plaintext}
          onChange={(e) => store.setPlaintext(e.target.value)}
          placeholder="Paste your sensitive text here…"
          className="w-full h-[420px] p-6 border rounded-xl resize-y font-mono text-sm bg-white dark:bg-black border-gray-200 dark:border-white/10 shadow-inner focus:border-indigo-500/50 dark:focus:border-orange-500/50 focus:ring-0 outline-none transition-colors leading-relaxed text-gray-900 dark:text-[#E0E0E0]"
        />
        <div className="absolute bottom-4 right-4 flex items-center justify-between text-[11px] font-mono w-full px-8 pointer-events-none">
          <span className="text-gray-500 dark:text-white/40">
            MIME: <span className="text-indigo-600 dark:text-orange-400">text/plain</span>
          </span>
          <span
            className={
              isOverLimit
                ? 'text-red-600 dark:text-red-500 font-bold'
                : 'text-gray-500 dark:text-white/40'
            }
          >
            {byteCount.toLocaleString()} / {maxSize.toLocaleString()} bytes
          </span>
        </div>
      </div>

      {isOverLimit && store.tier !== 'pro' && (
        <PaywallGate feature="Large pastes" />
      )}

      {/* ── OPTIONS PANEL ── */}
      <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden bg-gray-50 dark:bg-[#080808] shadow-sm dark:shadow-lg transition-colors">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs font-bold text-gray-600 dark:text-white/60 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition-colors"
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
        >
          <span>Options</span>
          {settingsOpen
            ? <ChevronUp   size={14} className="text-indigo-600 dark:text-orange-500" />
            : <ChevronDown size={14} className="text-indigo-600 dark:text-orange-500" />}
        </button>

        {settingsOpen && (
          <div
            id="settings-panel"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-5 pb-5 border-t border-gray-200 dark:border-white/10 pt-4"
          >
            <ExpirySelector />
            <ViewLimitSelector />
            <PasswordInput />

            {/* Syntax language — spec A.6, Gotcha #12 */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="language-select"
                className="block text-xs text-gray-600 dark:text-white/70 font-medium tracking-wide"
              >
                Syntax language
              </label>
              <select
                id="language-select"
                value={store.language ?? ''}
                onChange={(e) =>
                  store.setLanguage(e.target.value === '' ? null : e.target.value)
                }
                className="w-full bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded px-3 py-2.5 text-xs text-gray-900 dark:text-white/90 focus:outline-none focus:border-indigo-500 dark:focus:border-orange-500/50 transition-colors"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] font-mono text-gray-400 dark:text-white/30 tracking-wide">
                Enables syntax highlighting on the viewer page.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── ERROR BANNER ── */}
      {error !== null && (
        <div
          role="alert"
          className="p-4 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg text-sm border border-red-200 dark:border-red-500/20 font-medium tracking-wide"
        >
          {error}
        </div>
      )}

      {/* ── SUBMIT ── */}
      <button
        type="button"
        onClick={submit}
        disabled={store.isCreating || !store.plaintext.trim() || isOverLimit}
        className="w-full py-4 bg-indigo-600 dark:bg-white text-white dark:text-black text-sm font-bold rounded-xl hover:bg-indigo-700 dark:hover:bg-orange-500 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase tracking-widest shadow-lg flex items-center justify-center gap-3"
      >
        {store.isCreating && <Spinner size={16} />}
        {buttonLabel()}
      </button>
    </div>
  );
}
