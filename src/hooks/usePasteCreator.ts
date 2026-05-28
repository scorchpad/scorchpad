import { useState } from 'react';
import { usePasteStore } from '../store/pasteStore';
import { encryptText, encryptTextWithPassword, computePasswordProof } from '../lib/crypto';
import { createPaste } from '../mocks/api.mock';
import type { CreatingStep } from '../types';

export function usePasteCreator() {
  const store = usePasteStore();
  // FIX: Granular step state so PasteEditor can show "Deriving key..." during PBKDF2 (Gotcha #17)
  const [creatingStep, setCreatingStep] = useState<CreatingStep>('idle');

  async function handleCreate() {
    if (!store.plaintext.trim()) return;

    if (store.useCustomViews) {
      const raw = store.customViewsInput.trim();
      // FIX: Check raw string before parsing — parseInt("1.5") silently returns 1,
      // bypassing the float rejection required by Gotcha #15.
      // /^\d+$/ ensures only whole non-negative integers pass.
      if (!/^\d+$/.test(raw)) {
        throw new Error('Enter 0 for unlimited, or a whole number between 1 and 9999.');
      }
      const parsed = Number(raw);
      if (parsed > 9999) {
        throw new Error('Enter 0 for unlimited, or a whole number between 1 and 9999.');
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
      let passwordProof: string | undefined;
      let isPasswordPaste = false;

      if (store.hasPassword && store.passwordPlaintext) {
        // FIX: Separate step indicator — PBKDF2 takes ~500ms-1s on mobile (Gotcha #17)
        setCreatingStep('deriving');
        const result = await encryptTextWithPassword(store.plaintext, store.passwordPlaintext);
        encryptedBlob = result.encryptedBlob;
        iv = result.iv;
        passwordSalt = result.passwordSalt;
        // Compute server-side brute-force proof — HMAC of password against the salt.
        // Never used for decryption; only lets the server rate-limit repeated attempts.
        passwordProof = await computePasswordProof(store.passwordPlaintext, result.passwordSalt);
        isPasswordPaste = true;
      } else {
        setCreatingStep('encrypting');
        const result = await encryptText(store.plaintext);
        encryptedBlob = result.encryptedBlob;
        iv = result.iv;
        keyBase64 = result.keyBase64;
      }

      setCreatingStep('uploading');
      const finalMaxViews = store.useCustomViews ? Number(store.customViewsInput.trim()) : store.maxViews;

      // FIX: Include language field — was silently dropped before
      const result = await createPaste({
        encryptedBlob,
        iv,
        expirySeconds: store.expirySeconds,
        maxViews: finalMaxViews,
        hasPassword: store.hasPassword,
        passwordSalt,
        passwordProof,
        sizeBytes,
        language: store.language,
      });

      store.setCreated(result.id, keyBase64, isPasswordPaste);
    } catch (err: unknown) {
      // FIX: No `any` — narrow the type properly
      throw err instanceof Error ? err : new Error('Something went wrong. Please try again.');
    } finally {
      store.setCreating(false);
      setCreatingStep('idle');
    }
  }

  return { handleCreate, creatingStep };
}
