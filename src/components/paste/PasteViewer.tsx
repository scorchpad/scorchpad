'use client';
import { usePasteViewer } from '../../hooks/usePasteViewer';
import { PasswordPrompt } from './PasswordPrompt';
import { ExpiryCountdown } from './ExpiryCountdown';
import { CopyButton } from '../ui/CopyButton';
import { ErrorBoundary } from '../ErrorBoundary';
import { sanitizeHtml, sanitizeString } from '../../lib/sanitize';

function DecryptedContent({ content, language }: { content: string; language: string | null }) {
  if (language === 'html') {
    return (
      <iframe
        sandbox=""
        srcDoc={sanitizeHtml(content)}
        title="Paste content"
        className="w-full h-[600px] border border-gray-200 dark:border-white/10 rounded-xl bg-white shadow-sm"
      />
    );
  }
  return (
    <pre className="w-full min-h-[400px] p-8 border rounded-xl bg-white dark:bg-black border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg overflow-auto text-sm font-mono whitespace-pre-wrap text-gray-900 dark:text-[#E0E0E0] leading-relaxed transition-colors">
      {sanitizeString(content)}
    </pre>
  );
}

export function PasteViewer({ id }: { id: string }) {
  const { decryptedContent, setDecryptedContent, error, pasteData, isLoading } = usePasteViewer(id);

  if (error) {
    let msg = 'Could not decrypt. The link may be incomplete or corrupted.';
    if (error === 'not_found') msg = 'This paste has expired or no longer exists.';
    if (error === 'missing_key') msg = 'This link is missing the decryption key. Make sure you have the full URL.';
    return (
      <div className="w-full max-w-3xl mx-auto mt-12 p-8 border rounded-xl bg-white dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg text-center transition-colors">
        <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 uppercase tracking-widest">{msg}</p>
      </div>
    );
  }

  // FIX: Use explicit isLoading flag instead of !pasteData — shows correct loading during decrypt step too
  if (isLoading || !pasteData) {
    return <div className="flex justify-center mt-12"><div className="animate-pulse w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10" /></div>;
  }

  if (pasteData.hasPassword && !decryptedContent) {
    // Guard: passwordSalt must be present for password-protected pastes.
    // Missing salt = malformed server response — treat as decrypt failure rather than asserting.
    if (!pasteData.passwordSalt) {
      return (
        <div className="w-full max-w-3xl mx-auto mt-12 p-8 border rounded-xl bg-white dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg text-center transition-colors">
          <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 uppercase tracking-widest">Could not decrypt. The link may be incomplete or corrupted.</p>
        </div>
      );
    }
    return <PasswordPrompt id={id} passwordSalt={pasteData.passwordSalt} onDecrypted={setDecryptedContent} />;
  }

  if (!decryptedContent) {
    return <div className="flex justify-center mt-12"><div className="animate-pulse w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10" /></div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 flex flex-col gap-4 px-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4 text-[10px] text-gray-500 dark:text-white/40 uppercase tracking-widest font-mono">
          <ExpiryCountdown expiresAt={pasteData.expiresAt} />
          {pasteData.viewsRemaining > 0 && <span className="text-indigo-600 dark:text-orange-500 font-bold">• {pasteData.viewsRemaining} VIEWS LEFT</span>}
        </div>
        <CopyButton textToCopy={decryptedContent} className="px-4 py-2 bg-indigo-600 dark:bg-white text-white dark:text-black hover:bg-indigo-700 dark:hover:bg-orange-500 dark:hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm">COPY PAYLOAD</CopyButton>
      </div>

      {/* FIX: Wrap decrypted content in ErrorBoundary — crypto failures must not white-screen (Section C) */}
      <ErrorBoundary>
        <DecryptedContent content={decryptedContent} language={pasteData.language} />
      </ErrorBoundary>
    </div>
  );
}
