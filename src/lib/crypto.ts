// src/lib/crypto.ts
// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM encryption/decryption using the browser's native Web Crypto API.
// All operations run entirely client-side — nothing here ever runs on the server.
//
// SECURITY FIX (H1 — passwordProof offline oracle removed):
//   computePasswordProof() has been intentionally deleted.
//
//   The old flow:
//     computePasswordProof(password, salt)
//       → HMAC-SHA256(password, salt)
//       → sent to the server as passwordProof
//       → stored in Redis alongside the ciphertext
//
//   The problem: storing HMAC-SHA256(password, salt) in Redis created a fast
//   offline brute-force oracle. If Redis was ever dumped, an attacker got both
//   the ciphertext AND a 1× HMAC-SHA256 target. A GPU can compute ~1B HMAC
//   ops/sec, collapsing the 310,000-iteration PBKDF2 key stretching entirely.
//
//   The fix: the server no longer stores any password-derived value. The global
//   per-paste attempt counter (pv:pwattempts:{id}) is the only brute-force gate.
//   Wrong-password detection is now purely client-side: AES-GCM decryption with
//   an incorrect key throws a DOMException ("OperationError"), which PasswordPrompt
//   catches and surfaces as "Incorrect password."
//
//   Zero-knowledge chain after this fix:
//     Server stores: encryptedBlob, iv, passwordSalt (needed for PBKDF2), maxViews, expiresAt
//     Server NEVER has: password, derived key, passwordProof, plaintext
//     Decryption is impossible without the correct password + 310,000× PBKDF2
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptResult {
  encryptedBlob: string;  // URL-safe base64 ciphertext
  iv: string;             // URL-safe base64 IV (12 bytes → 16 chars)
  keyBase64: string;      // URL-safe base64 AES key — caller puts this in URL fragment ONLY
}

export interface PasswordEncryptResult {
  encryptedBlob: string;  // URL-safe base64 ciphertext
  iv: string;             // URL-safe base64 IV (12 bytes → 16 chars)
  passwordSalt: string;   // URL-safe base64 PBKDF2 salt (32 bytes → 43 chars)
                          // Stored in Redis. Needed to re-derive the AES key.
                          // Not sensitive on its own — the password is the secret.
}

// ── Key-based encryption (no password) ───────────────────────────────────────

export async function encryptText(plaintext: string): Promise<EncryptResult> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const rawKey = await crypto.subtle.exportKey('raw', key);

  return {
    encryptedBlob: toUrlSafeBase64(new Uint8Array(ciphertext)),
    iv:            toUrlSafeBase64(iv),
    keyBase64:     toUrlSafeBase64(new Uint8Array(rawKey)),
  };
}

export async function decryptText(
  encryptedBlob: string,
  iv: string,
  keyBase64: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    fromUrlSafeBase64(keyBase64),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromUrlSafeBase64(iv) },
    key,
    fromUrlSafeBase64(encryptedBlob)
  );

  return new TextDecoder().decode(decrypted);
}

// ── Password-based encryption / decryption ────────────────────────────────────

export async function encryptTextWithPassword(
  plaintext: string,
  password: string
): Promise<PasswordEncryptResult> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKeyFromPassword(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    encryptedBlob: toUrlSafeBase64(new Uint8Array(ciphertext)),
    iv:            toUrlSafeBase64(iv),
    passwordSalt:  toUrlSafeBase64(salt),
  };
}

/**
 * Derives the AES key from password + salt (PBKDF2, 310,000 iterations, SHA-256)
 * then decrypts the blob with AES-256-GCM.
 *
 * Throws a DOMException ("OperationError") if the password is wrong — the
 * AES-GCM authentication tag verification fails. Callers (PasswordPrompt)
 * catch this and show "Incorrect password."
 *
 * This is the authoritative wrong-password signal after the removal of
 * server-side passwordProof verification (H1 fix).
 */
export async function decryptTextWithPassword(
  encryptedBlob: string,
  iv: string,
  password: string,
  passwordSalt: string
): Promise<string> {
  const salt = fromUrlSafeBase64(passwordSalt);
  const key  = await deriveKeyFromPassword(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromUrlSafeBase64(iv) },
    key,
    fromUrlSafeBase64(encryptedBlob)
  );

  return new TextDecoder().decode(decrypted);
}

// ── PBKDF2 key derivation ─────────────────────────────────────────────────────

async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt,
      iterations: 310_000,
      hash:       'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

export function toUrlSafeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function fromUrlSafeBase64(b64: string): Uint8Array {
  const padded    = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const padded2   = padded + '='.repeat(padLength);
  const binary    = atob(padded2);
  const bytes     = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
