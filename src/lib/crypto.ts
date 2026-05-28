// src/lib/crypto.ts
// AES-256-GCM encryption/decryption using the browser's native Web Crypto API.

export interface EncryptResult {
  encryptedBlob: string;  // URL-safe base64 ciphertext
  iv: string;             // URL-safe base64 IV (12 bytes)
  keyBase64: string;      // URL-safe base64 AES key — caller puts this in URL fragment ONLY
}

export interface PasswordEncryptResult {
  encryptedBlob: string;  // URL-safe base64 ciphertext
  iv: string;             // URL-safe base64 IV
  passwordSalt: string;   // URL-safe base64 PBKDF2 salt — stored in Redis alongside blob (not sensitive)
}

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
    iv: toUrlSafeBase64(iv),
    keyBase64: toUrlSafeBase64(new Uint8Array(rawKey)),
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

export async function encryptTextWithPassword(
  plaintext: string,
  password: string
): Promise<PasswordEncryptResult> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKeyFromPassword(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    encryptedBlob: toUrlSafeBase64(new Uint8Array(ciphertext)),
    iv: toUrlSafeBase64(iv),
    passwordSalt: toUrlSafeBase64(salt),
  };
}

export async function decryptTextWithPassword(
  encryptedBlob: string,
  iv: string,
  password: string,
  passwordSalt: string
): Promise<string> {
  const salt = fromUrlSafeBase64(passwordSalt);
  const key = await deriveKeyFromPassword(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromUrlSafeBase64(iv) },
    key,
    fromUrlSafeBase64(encryptedBlob)
  );

  return new TextDecoder().decode(decrypted);
}

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
      name: 'PBKDF2',
      salt,
      iterations: 310_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function computePasswordProof(
  password: string,
  passwordSalt: string
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    fromUrlSafeBase64(passwordSalt)
  );

  return toUrlSafeBase64(new Uint8Array(sig));
}

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
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const padded2 = padded + '='.repeat(padLength);
  const binary = atob(padded2);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
