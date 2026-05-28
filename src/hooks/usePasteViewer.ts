import { useState, useEffect } from 'react';
import { getPaste, GetPasteResponse } from '../mocks/api.mock';
import { decryptText } from '../lib/crypto';
import { extractKeyFromFragment, eraseKeyFromUrl } from '../lib/urlFragment';

export function usePasteViewer(id: string) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteData, setPasteData] = useState<GetPasteResponse | null>(null);
  // FIX: Explicit loading state — distinguishes "fetching" from "decrypting" from "done"
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const paste = await getPaste(id);
        if (!paste) { setError('not_found'); return; }
        setPasteData(paste);

        if (!paste.hasPassword && paste.encryptedBlob && paste.iv) {
          const key = extractKeyFromFragment();
          if (!key) { setError('missing_key'); return; }
          try {
            const plaintext = await decryptText(paste.encryptedBlob, paste.iv, key);
            setDecryptedContent(plaintext);
            eraseKeyFromUrl(id);
          } catch {
            // Never surface raw crypto exception — catches DOMException, etc.
            setError('decrypt_failed');
          }
        }
      } catch {
        setError('not_found');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id]);

  return { decryptedContent, setDecryptedContent, error, setError, pasteData, setPasteData, isLoading };
}
