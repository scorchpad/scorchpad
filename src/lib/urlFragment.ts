// src/lib/urlFragment.ts

export function buildShareableLink(id: string, keyBase64: string): string {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://scorchpad.rsaatlabs.com';
  return `${origin}/p/${id}#${keyBase64}`;
}

export function buildPasswordShareableLink(id: string): string {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://scorchpad.rsaatlabs.com';
  return `${origin}/p/${id}`;
}

export function extractKeyFromFragment(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  return hash.length > 0 ? hash : null;
}

export function eraseKeyFromUrl(id: string): void {
  if (typeof window === 'undefined') return;
  history.replaceState(null, '', `/p/${id}`);
}
