'use client';
import { useState, useEffect, useRef } from 'react';
import { usePasteStore } from '../../store/pasteStore';
import { usePasteCreator } from '../../hooks/usePasteCreator';
import { ExpirySelector } from './ExpirySelector';
import { ViewLimitSelector } from './ViewLimitSelector';
import { PasswordInput } from './PasswordInput';
import { PasteResult } from './PasteResult';
import { Spinner } from '../ui/Spinner';
import { PaywallGate } from '../PaywallGate';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Syntax language options for code pastes.
// Stored in Redis as unencrypted metadata — not sensitive.
const LANGUAGE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Plain text (default)', value: '' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'Python', value: 'python' },
  { label: 'Rust', value: 'rust' },
  { label: 'Go', value: 'go' },
  { label: 'Java', value: 'java' },
  { label: 'C / C++', value: 'cpp' },
  { label: 'C#', value: 'csharp' },
  { label: 'Bash / Shell', value: 'bash' },
  { label: 'SQL', value: 'sql' },
  { label: 'JSON', value: 'json' },
  { label: 'YAML', value: 'yaml' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Dockerfile', value: 'dockerfile' },
  { label: 'Ruby', value: 'ruby' },
  { label: 'PHP', value: 'php' },
  { label: 'Swift', value: 'swift' },
  { label: 'Kotlin', value: 'kotlin' },
];

// Per-tier paste size ceilings (bytes).
// Annual Pro gets 1 MB; all other Pro plans get 500 KB.
const SIZES = {
  anonymous: 10_240,
  free: 51_200,
  pro_standard: 524_288,
  pro_annual: 1_048_576,
} as const;

export function PasteEditor() {
  const store = usePasteStore();
  const { handleCreate, creatingStep } = usePasteCreator();
  const [error, setError] = useState('');
  // Settings panel open/closed — collapsed by default so the textarea is the hero.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isAnnualPro = store.tier === 'pro' && store.planDuration === 'annual';
  const maxSize =
    store.tier === 'pro'
      ? isAnnualPro
        ? SIZES.pro_annual
        : SIZES.pro_standard
      : store.tier === 'free'
      ? SIZES.free
      : SIZES.anonymous;

  const [byteCount, setByteCount] = useState(0);

  useEffect(() => {
    setByteCount(new TextEncoder().encode(store.plaintext).byteLength);
  }, [store.plaintext]);

  // Auto-focus textarea on mount so the user can start typing immediately.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  if (store.createdId) {
    return <PasteResult />;
  }

  const isOverLimit = byteCount > maxSize;

  const submit = async () => {
    setError('');
    if (isOverLimit) {
      setError('Paste exceeds the size limit for your plan.');
      return;
    }
    try {
      await handleCreate();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    }
  };

  // Granular button label so users see what's happening during ~500ms PBKDF2 (Gotcha #17).
  const buttonLabel = () => {
    if (!store.isCreating) return 'Create Secure Link';
    if (creatingStep === 'deriving') return 'Deriving key...';
    if (creatingStep === 'uploading') return 'Uploading...';
    return 'Encrypting...';
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto mt-4 px-2">

      {/* ── HERO: textarea fills viewport above the fold ─────────────────── */}
      <div className="relative w-full">
        <textarea
          ref={textareaRef}
          value={store.plaintext}
          onChange={(e) => store.setPlaintext(e.target.value)}
          placeholder="Paste your sensitive text here..."
          className="w-full h-[420px] p-6 border rounded-xl resize-y font-mono text-sm bg-white dark:bg-black border-gray-200 dark:border-white/10 shadow-inner focus:border-indigo-500/50 dark:focus:border-orange-500/50 focus:ring-0 outline-none transition-colors leading-relaxed text-gray-900 dark:text-[#E0E0E0]"
        />
        {/* Byte counter and MIME type indicator */}
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

      {/* ── SETTINGS PANEL: collapsible, below the textarea ──────────────── */}
      <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden bg-gray-50 dark:bg-[#080808] shadow-sm dark:shadow-lg transition-colors">
        {/* Toggle header */}
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs font-bold text-gray-600 dark:text-white/60 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition-colors"
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
        >
          <span>Options</span>
          {settingsOpen ? (
            <ChevronUp size={14} className="text-indigo-600 dark:text-orange-500" />
          ) : (
            <ChevronDown size={14} className="text-indigo-600 dark:text-orange-500" />
          )}
        </button>

        {/* Collapsible body */}
        {settingsOpen && (
          <div
            id="settings-panel"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-5 pb-5 border-t border-gray-200 dark:border-white/10 pt-4"
          >
            <ExpirySelector />
            <ViewLimitSelector />
            <PasswordInput />

            {/* ── Syntax language selector (FAIL 1 fix) ───────────────────── */}
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
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg text-sm border border-red-200 dark:border-red-500/20 font-medium tracking-wide">
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={store.isCreating || !store.plaintext.trim()}
        className="w-full py-4 bg-indigo-600 dark:bg-orange-600 text-white rounded-lg font-bold shadow-md dark:shadow-lg dark:shadow-orange-500/20 uppercase tracking-[0.2em] text-sm hover:bg-indigo-700 dark:hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all"
      >
        {store.isCreating ? (
          <>
            <Spinner /> {buttonLabel()}
          </>
        ) : (
          buttonLabel()
        )}
      </button>
    </div>
  );
}
