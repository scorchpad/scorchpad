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
// ─── BREADCRUMBS API MIGRATION: v7 → v8 ─────────────────────────────────────
//
// Sentry v7 typed breadcrumbs as a wrapper object with a `values` property:
//   event.breadcrumbs: { values?: Breadcrumb[] }    ← v7
//
// Sentry v8+ (this project uses v10 via @sentry/nextjs@10.54.0) replaced that
// with a plain flat array:
//   event.breadcrumbs: Breadcrumb[]                 ← v8+ (current)
//
// Consequence: accessing `.values` on a Breadcrumb[] resolves to the built-in
// Array.prototype.values METHOD (typed `() => IterableIterator<T>`), not a
// Sentry-defined property. TypeScript rejects `for (const x of fn)` because
// a function is not iterable. The correct v8+ pattern is:
//
//   for (const crumb of event.breadcrumbs) { … }    ← correct for v8+
//
// DO NOT write `event.breadcrumbs.values` or `event.breadcrumbs?.values` —
// that resolves to Array.prototype.values (the method), which is always truthy
// and is not iterable. It is both a TypeScript error and a silent runtime bug.
//
// ─── @sentry/nextjs v8+ TYPE CHANGE ──────────────────────────────────────────
//
// In @sentry/nextjs ≥ 8, the `beforeSend` hook signature narrowed from:
//
//   (event: Event, hint: EventHint) => Event | null          ← v7 and earlier
//
// to:
//
//   (event: ErrorEvent, hint: EventHint) => ErrorEvent | null  ← v8+
//
// `ErrorEvent` is a subtype of `Event` that narrows `type` to `undefined`
// (error events have no type; only transactions have type: "transaction").
// TypeScript correctly rejects assigning the broader `Event` to `ErrorEvent`
// because their `type` properties are incompatible:
//   Event.type      = EventType  ('transaction' | 'profile' | …)
//   ErrorEvent.type = undefined
//
// Using `ErrorEvent` here fixes the type error in instrumentation-client.ts
// AND instrumentation.ts (server) in one change — both import from here.
//
// No logic change is required. `ErrorEvent` has all the same fields as `Event`
// (`request.url`, `breadcrumbs`, etc.) — it is purely a type narrowing.
// ─────────────────────────────────────────────────────────────────────────────

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Strip URL fragments from every Sentry event before it leaves the runtime.
 *
 * Register this as `beforeSend` in all three Sentry init calls
 * (server, edge, client). Returning `null` silences the event entirely —
 * used here only as an absolute last resort if stripping fails.
 *
 * Typed as `ErrorEvent` (not `Event`) to match the `beforeSend` signature
 * in @sentry/nextjs ≥ 8. See type-change note above.
 */
export function scrubFragmentFromEvent(
  event: ErrorEvent,
  _hint: EventHint
): ErrorEvent | null {
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
  // @sentry/nextjs v7 typed breadcrumbs as a wrapper object:
  //   event.breadcrumbs: { values?: Breadcrumb[] }   ← v7
  //
  // @sentry/nextjs v8+ (including v10 which this project uses) changed the
  // type to a plain flat array:
  //   event.breadcrumbs: Breadcrumb[]                ← v8+ (current)
  //
  // Accessing `.values` on a Breadcrumb[] does NOT read a Sentry property —
  // it resolves to Array.prototype.values, the built-in array method typed as
  // () => IterableIterator<Breadcrumb>. TypeScript correctly rejects
  // `for (const crumb of someFunction)` because a function is not iterable.
  //
  // Correct v8+ pattern: iterate event.breadcrumbs directly.
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.data?.url === 'string') {
        crumb.data.url = crumb.data.url.split('#')[0] ?? '';
      }
    }
  }

  return event;
}
