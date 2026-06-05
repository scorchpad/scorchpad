// src/hooks/usePasteCreator.ts
// Orchestrates the paste creation flow:
//   1. Validate custom view count (Gotcha #15)
//   2. Encrypt plaintext (AES-256-GCM, or PBKDF2 for password pastes)
//   3. POST to /api/paste/create
//   4. Update Zustand store with the new paste ID + decryption key
//
// SECURITY FIX (H1 — passwordProof removed):
//   OLD: After encryption, the hook called computePasswordProof(password, salt)
//        to compute an HMAC-SHA256 token, then included it as passwordProof in
//        the createPaste() request body.
//   NEW: computePasswordProof is gone. passwordProof is no longer computed or
//        sent. The server rejects any request body that still contains
//        passwordProof (see create/route.ts — ERR_INVALID_FIELD). The
//        createPaste() request now includes only encryptedBlob, iv,
//        expirySeconds, maxViews, hasPassword, passwordSalt, sizeBytes, language.
//
// CHANGELOG (prior version):
//   FIX: After a successful createPaste() call, if the response includes
//   rateLimitRemaining, call store.setPastesRemainingToday() immediately.
//   Previously the store's pastesRemainingToday only updated on the next
//   useSubscription() fetch (a GET to /api/user/subscription), which fires
//   on the next page load. A user who just created their 3rd anonymous paste
//   would see "3 remaining" until they refreshed — now they see "0 remaining"
//   the moment the button returns.

import { useState } from 'react';
import { usePasteStore } from '../store/pasteStore';
import { encryptText, encryptTextWithPassword } from '../lib/crypto';
import { createPaste } from '../mocks/api.mock';
import type { CreatingStep } from '../types';

export function usePasteCreator() {
  const store = usePasteStore();
  // Granular step state so PasteEditor can show "Deriving key…" during PBKDF2 (Gotcha #17)
  const [creatingStep, setCreatingStep] = useState<CreatingStep>('idle');

  async function handleCreate() {
    if (!store.plaintext.trim()) return;

    // ── Validate custom view count (Gotcha #15) ───────────────────────────
    // parseInt("1.5") silently returns 1, bypassing float rejection.
    // /^\d+$/ ensures only whole non-negative integers pass.
    if (store.useCustomViews) {
      const raw = store.customViewsInput.trim();
      if (!/^\d+$/.test(raw)) {
        throw new Error('Enter 0 for unlimited, or a whole number between 1 and 9999.');
      }
      const parsed = Number(raw);
      if (parsed > 9999) {
        throw new Error('View count cannot exceed 9999.');
      }
      store.setMaxViews(parsed);
    }

    store.setCreating(true);
    setCreatingStep('idle');

    try {
      const sizeBytes = new TextEncoder().encode(store.plaintext).byteLength;

      let encryptedBlob: string;
      let iv: string;
      let keyBase64: string | null = null;
      let passwordSalt: string | undefined;
      let isPasswordPaste = false;

      if (store.hasPassword && store.passwordPlaintext) {
        // PBKDF2 takes ~500ms–1s on mobile — show "Deriving key…" (Gotcha #17)
        setCreatingStep('deriving');
        const result = await encryptTextWithPassword(store.plaintext, store.passwordPlaintext);
        encryptedBlob   = result.encryptedBlob;
        iv              = result.iv;
        passwordSalt    = result.passwordSalt;
        // FIX H1: passwordProof intentionally NOT computed or sent.
        // The server no longer stores or checks a password-derived value.
        // Wrong-password detection is now purely client-side via AES-GCM
        // auth-tag verification in decryptTextWithPassword().
        isPasswordPaste = true;
      } else {
        setCreatingStep('encrypting');
        const result = await encryptText(store.plaintext);
        encryptedBlob  = result.encryptedBlob;
        iv             = result.iv;
        keyBase64      = result.keyBase64;
      }

      setCreatingStep('uploading');
      const finalMaxViews = store.useCustomViews
        ? Number(store.customViewsInput.trim())
        : store.maxViews;

      const result = await createPaste({
        encryptedBlob,
        iv,
        expirySeconds: store.expirySeconds,
        maxViews:      finalMaxViews,
        hasPassword:   store.hasPassword,
        passwordSalt,
        // FIX H1: passwordProof field removed — not sent.
        sizeBytes,
        language:      store.language,
      });

      // ── Immediately update the paste-remaining counter ─────────────────
      // The server returns rateLimitRemaining in the 201 body. Using it here
      // saves a full /api/user/subscription round-trip for the UI to reflect
      // the new count. Optional — guard for backward compatibility.
      if (typeof result.rateLimitRemaining === 'number') {
        store.setPastesRemainingToday(result.rateLimitRemaining);
      }

      store.setCreated(result.id, keyBase64, isPasswordPaste);
    } catch (err: unknown) {
      // Re-throw so PasteEditor's submit() catch block can call buildErrorNode()
      // with the full ApiError (status, retryAfter, upgradeUrl, etc.).
      // Never swallow here — doing so would turn "Daily limit reached" into
      // "Something went wrong."
      throw err instanceof Error ? err : new Error('Something went wrong. Please try again.');
    } finally {
      store.setCreating(false);
      setCreatingStep('idle');
    }
  }

  return { handleCreate, creatingStep };
}
