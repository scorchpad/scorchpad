'use client';
import { useState, useRef, useEffect } from 'react';
import { computePasswordProof, decryptTextWithPassword } from '../../lib/crypto';
import { verifyPastePassword } from '../../mocks/api.mock';
import { Spinner } from '../ui/Spinner';
import { eraseKeyFromUrl } from '../../lib/urlFragment';
import type { DecryptStep } from '../../types';

// FIX: Granular step state — PBKDF2 (310,000 iterations) takes ~500ms-1s on mobile (Gotcha #17)

export function PasswordPrompt({ id, passwordSalt, onDecrypted }: { id: string; passwordSalt: string; onDecrypted: (text: string) => void }) {
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<DecryptStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const isLoading = step !== 'idle';

  const stepLabel = () => {
    if (step === 'deriving') return 'Deriving key...';
    if (step === 'decrypting') return 'Decrypting...';
    return 'Decrypt';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setStep('deriving');
    setError(null);
    try {
      // Step 1: PBKDF2 key derivation (~500ms-1s on mobile)
      const proof = await computePasswordProof(password, passwordSalt);
      // Step 2: Server verify + fetch blob
      const res = await verifyPastePassword(id, proof);
      if (!res) throw new Error('Incorrect password.');
      // Step 3: AES-GCM decrypt (fast)
      setStep('decrypting');
      const plaintext = await decryptTextWithPassword(res.encryptedBlob, res.iv, password, passwordSalt);
      onDecrypted(plaintext);
      eraseKeyFromUrl(id);
    } catch (err: unknown) {
      // FIX: No `any` — narrow properly; never leak raw crypto exceptions
      const message = err instanceof Error ? err.message : 'Incorrect password.';
      const safeMessage = message.toLowerCase().includes('crypto') ||
        message.toLowerCase().includes('decrypt')
          ? 'Decryption failed. Check your password and try again.'
          : message;
      setError(safeMessage);
    } finally {
      setStep('idle');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-12 p-8 border rounded-xl bg-white dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg text-center transition-colors">
      <h2 className="text-xl font-bold tracking-tighter mb-2 text-gray-900 dark:text-white uppercase">Protected Payload</h2>
      <p className="text-[11px] font-mono text-gray-600 dark:text-white/50 mb-6 tracking-wide">Enter the decryption key.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          className="p-3 border rounded-lg bg-gray-50 dark:bg-black border-gray-200 dark:border-white/10 outline-none focus:border-indigo-500 focus:dark:border-orange-500/50 w-full text-center tracking-widest text-gray-900 dark:text-[#E0E0E0]"
        />
        {error && <div className="text-[10px] text-red-600 dark:text-red-500 font-mono tracking-widest uppercase">{error}</div>}
        <button
          type="submit"
          disabled={isLoading || !password}
          className="w-full py-3 bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-500 text-white rounded font-bold shadow-md dark:shadow-lg dark:shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all uppercase tracking-widest"
        >
          {isLoading ? <><Spinner /> {stepLabel()}</> : stepLabel()}
        </button>
      </form>
    </div>
  );
}
