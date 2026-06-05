'use client';
// src/components/paste/PasswordPrompt.tsx
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY FIX (H1 — passwordProof removed, client-side wrong-password detection):
//
//   OLD flow:
//     1. setStep('deriving')
//     2. computePasswordProof(password, passwordSalt)  ← HMAC, fast
//     3. verifyPastePassword(id, proof)                ← server compares proof
//     4. null → "Incorrect password." (server gate)
//     5. setStep('decrypting')
//     6. decryptTextWithPassword(...)
//
//   NEW flow (passwordProof eliminated):
//     1. setStep('verifying')  ← "Fetching..." — network call only
//     2. verifyPastePassword(id)  ← no proof sent, server returns blob
//        null → paste not found / expired (404)
//        ApiError 429 ERR_PASTE_LOCKED → too many attempts, show specific message
//     3. setStep('deriving')  ← "Decrypting..." — PBKDF2 + AES-GCM
//     4. decryptTextWithPassword(res.encryptedBlob, res.iv, password, passwordSalt)
//        DOMException ("OperationError") → wrong password — AES-GCM auth-tag fails
//
//   The wrong-password signal is now a DOMException from the Web Crypto API
//   rather than a server 401. This eliminates the need for passwordProof storage
//   on the server (offline oracle attack — see crypto.ts and H1 in the audit).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { decryptTextWithPassword } from '../../lib/crypto';
import { verifyPastePassword, ApiError } from '../../mocks/api.mock';
import { Spinner } from '../ui/Spinner';
import { eraseKeyFromUrl } from '../../lib/urlFragment';
import type { DecryptStep } from '../../types';

export function PasswordPrompt({
  id,
  passwordSalt,
  onDecrypted,
}: {
  id:           string;
  passwordSalt: string;
  onDecrypted:  (text: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [step,     setStep]     = useState<DecryptStep>('idle');
  const [error,    setError]    = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const isLoading = step !== 'idle';

  const stepLabel = () => {
    if (step === 'verifying')  return 'Fetching...';
    if (step === 'deriving')   return 'Decrypting...';
    if (step === 'decrypting') return 'Decrypting...';
    return 'Decrypt';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError(null);

    try {
      // ── Step 1: Fetch the encrypted blob from the server ─────────────────
      // The server no longer verifies a password proof — it returns the blob
      // to any caller within the global attempt limit.
      setStep('verifying');
      const res = await verifyPastePassword(id);

      if (!res) {
        // 404 — paste not found or expired.
        throw new Error('Paste not found or has expired.');
      }

      // ── Step 2: PBKDF2 key derivation + AES-GCM decryption ───────────────
      // This is the slow step (~500ms–1s on mobile for PBKDF2 310k iterations).
      // If the password is wrong, AES-GCM throws DOMException ("OperationError")
      // because the auth tag verification fails — no padding oracle, no timing
      // side-channel. We catch it below and map it to "Incorrect password."
      setStep('deriving');
      const plaintext = await decryptTextWithPassword(
        res.encryptedBlob,
        res.iv,
        password,
        passwordSalt
      );

      // ── Step 3: Success ───────────────────────────────────────────────────
      onDecrypted(plaintext);
      eraseKeyFromUrl(id);

    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'ERR_PASTE_LOCKED') {
          // Global attempt ceiling reached — paste is locked.
          setError('Too many password attempts. This paste has been locked.');
        } else if (err.status === 429) {
          setError('Too many attempts. Please wait a moment and try again.');
        } else {
          setError(err.message || 'An error occurred. Please try again.');
        }
        return;
      }

      // DOMException from AES-GCM → wrong password.
      // Also catch any other unexpected error without leaking raw crypto details.
      const message = err instanceof Error ? err.message : '';
      const isCryptoFailure =
        message.toLowerCase().includes('operationerror') ||
        message.toLowerCase().includes('decrypt') ||
        message.toLowerCase().includes('crypto') ||
        (err instanceof DOMException && err.name === 'OperationError');

      setError(
        isCryptoFailure
          ? 'Incorrect password. Please try again.'
          : (message || 'An unexpected error occurred. Please try again.')
      );
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
          disabled={isLoading}
          className="p-3 border rounded-lg bg-gray-50 dark:bg-black border-gray-200 dark:border-white/10 outline-none focus:border-indigo-500 focus:dark:border-orange-500/50 w-full text-center tracking-widest text-gray-900 dark:text-[#E0E0E0] disabled:opacity-60"
        />
        {error && (
          <div className="text-[10px] text-red-600 dark:text-red-500 font-mono tracking-widest uppercase">
            {error}
          </div>
        )}
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
