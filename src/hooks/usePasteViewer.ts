// src/hooks/usePasteViewer.ts
// ─────────────────────────────────────────────────────────────────────────────
// React hook that drives the paste viewer page.
//
// Responsibilities:
//   1. Fetch paste metadata from GET /api/paste/[id]
//   2. Decrypt the encrypted blob client-side using the key from the URL fragment
//   3. Expose state: decryptedContent, error, pasteData, isLoading
//
// ─── FIXES ───────────────────────────────────────────────────────────────────
//
// FIX 1 — AbortController cleanup (React StrictMode + navigation safety)
//   Previously the useEffect had NO cleanup function.  In React StrictMode
//   (development) effects fire twice: the first load() call's setState would
//   race with the second call, potentially writing 'not_found' over a
//   successfully decrypted paste.  Adding an AbortController:
//     • Cancels any in-flight fetch when the component unmounts or the effect
//       re-runs (e.g., because `id` changes).
//     • Makes state mutations conditional on `!signal.aborted` so a stale
//       async completion can never clobber a fresher one.
//
// FIX 2 — Precise error categorisation
//   Previously ALL errors (rate-limit, server crash, network timeout) called
//   setError('not_found'), showing "This paste has expired or no longer exists."
//   for what might be a 429 or 503.  The outer catch now inspects the ApiError
//   status to set the most accurate error code, giving the user correct context.
//
// FIX 3 — getPaste() null vs. ApiError distinction
//   getPaste() returns null on 404 and throws ApiError on other HTTP errors.
//   The hook now handles these separately instead of collapsing both into
//   'not_found'.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { getPaste, ApiError, type GetPasteResponse } from '../mocks/api.mock';
import { decryptText } from '../lib/crypto';
import { extractKeyFromFragment, eraseKeyFromUrl } from '../lib/urlFragment';

export function usePasteViewer(id: string) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [error, setError]                       = useState<string | null>(null);
  const [pasteData, setPasteData]               = useState<GetPasteResponse | null>(null);
  const [isLoading, setIsLoading]               = useState(true);

  useEffect(() => {
    // FIX 1: AbortController lets us cancel in-flight work when the component
    // unmounts or the effect re-runs (React StrictMode double-fire in dev,
    // or rapid navigation in production).
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      // Guard: don't even start if already aborted (StrictMode cleanup fires
      // synchronously before the second run in some React versions).
      if (signal.aborted) return;

      setIsLoading(true);

      try {
        const paste = await getPaste(id, signal);

        // Abort check after every await — the component may have unmounted.
        if (signal.aborted) return;

        if (!paste) {
          // FIX 2: 404 is definitively "not found or expired".
          setError('not_found');
          return;
        }

        setPasteData(paste);

        // ── Non-password paste: decrypt immediately from the URL fragment ──
        if (!paste.hasPassword && paste.encryptedBlob && paste.iv) {
          const key = extractKeyFromFragment();
          if (!key) {
            setError('missing_key');
            return;
          }

          try {
            const plaintext = await decryptText(paste.encryptedBlob, paste.iv, key);

            if (signal.aborted) return;

            setDecryptedContent(plaintext);
            eraseKeyFromUrl(id);
          } catch {
            // Never surface raw crypto exception (DOMException, etc.).
            if (!signal.aborted) setError('decrypt_failed');
          }
        }
        // Password-protected paste: caller renders <PasswordGate> using pasteData.
        // Decryption happens in usePastePasswordVerifier after the user submits.

      } catch (err) {
        if (signal.aborted) return;

        // FIX 2: Distinguish error categories so the viewer can show a precise
        // message instead of always claiming the paste "doesn't exist".
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError('not_found');
          } else if (err.status === 429) {
            setError('rate_limited');
          } else {
            // 500, 503, network error, etc.
            setError('server_error');
          }
        } else {
          // Non-ApiError (e.g., fetch() network failure, JSON parse error).
          setError('server_error');
        }
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    }

    load();

    // FIX 1: Cancel the in-flight request when the effect is cleaned up.
    return () => {
      controller.abort();
    };
  }, [id]);

  return {
    decryptedContent,
    setDecryptedContent,
    error,
    setError,
    pasteData,
    setPasteData,
    isLoading,
  };
}
