// src/lib/sanitize.ts
import DOMPurify from 'dompurify';

export function sanitizeString(dirty: string): string {
  if (typeof window === 'undefined') return dirty; 
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: false } });
}

export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') return dirty;
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
