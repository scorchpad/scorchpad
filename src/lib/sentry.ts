// src/lib/sentry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared Sentry utilities — imported by every Sentry init point:
//   • instrumentation.ts        (server Node.js runtime)
//   • instrumentation.ts        (server Edge runtime — same file, runtime guard)
//   • instrumentation-client.ts (browser)
//
// This file MUST stay free of server-only imports so it can be included in
// the browser bundle safely. Only type imports from @sentry/nextjs are used.
//
// ─── SECURITY: URL FRAGMENT SCRUBBING ────────────────────────────────────────
//
// ScorchPad stores the symmetric AES-GCM decryption key in the URL fragment:
//
//   https://scorchpad.rsaatlabs.com/p/<id>#<base64url-key>
//
// Browsers do NOT transmit fragments to the server, so the key never crosses
// the wire during normal operation. However, Sentry can capture the full URL
// from two surfaces:
//
//   1. event.request.url      — server SDK injects the current request URL.
//      Theoretically the fragment shouldn't reach the server, but defence-in-
//      depth demands we scrub it anyway (misconfigured proxy, SSR edge case).
//
//   2. breadcrumb[n].data.url — client SDK records navigation and XHR URLs as
//      breadcrumbs. If the user navigates to a pad URL, the fragment IS in
//      window.location and WILL appear in these breadcrumbs.
//
// If either surface leaked a fragment to Sentry (a third-party SaaS with its
// own data retention), the zero-knowledge encryption model would be broken.
//
// scrubFragmentFromEvent() MUST be registered as `beforeSend` in all three
// runtime configurations. Missing even one context is a security gap.
//
// ─── BUG FIX NOTE (important if you ever inline this logic) ─────────────────
//
// event.breadcrumbs.values is Breadcrumb[] — a plain JavaScript array.
// The correct way to iterate it is:
//
//   for (const crumb of event.breadcrumbs.values) { … }   ✓  iterate array
//
// NOT:
//
//   for (const crumb of event.breadcrumbs.values()) { … }  ✗  calls array as
//                                                              function → throws
//                                                              TypeError at runtime
//
// The previous sentry.*.config.ts files had the broken form. Sentry silently
// catches the TypeError inside beforeSend, which means breadcrumb URLs were
// NEVER being scrubbed — a live security regression.
// ─────────────────────────────────────────────────────────────────────────────

import type { Event, EventHint } from '@sentry/nextjs';

/**
 * Strip URL fragments from every Sentry event before it leaves the runtime.
 *
 * Register this as `beforeSend` in all three Sentry init calls
 * (server, edge, client). Returning `null` silences the event entirely —
 * used here only as an absolute last resort if stripping fails.
 */
export function scrubFragmentFromEvent(
  event: Event,
  _hint: EventHint
): Event | null {
  // ── 1. Top-level request URL ──────────────────────────────────────────────
  if (event.request?.url) {
    const clean = event.request.url.split('#')[0] ?? '';

    // Belt-and-suspenders: if the split somehow didn't remove the fragment
    // (should never happen, but cryptographic operations get no "probably fine")
    // drop the entire event rather than risk leaking the key.
    if (clean.includes('#')) return null;

    event.request.url = clean;
  }

  // ── 2. Navigation / XHR breadcrumb URLs ──────────────────────────────────
  //
  // event.breadcrumbs is { values?: Breadcrumb[] }.
  // event.breadcrumbs.values is the Breadcrumb ARRAY — iterate it directly.
  // Do NOT append () — that would invoke the array as a function and throw.
  if (event.breadcrumbs?.values) {
    for (const crumb of event.breadcrumbs.values) {
      if (typeof crumb.data?.url === 'string') {
        crumb.data.url = crumb.data.url.split('#')[0] ?? '';
      }
    }
  }

  return event;
}
