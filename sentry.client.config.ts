import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend(event) {
    // Strip URL fragment from request URL — the fragment contains the decryption key
    if (event.request?.url) {
      event.request.url = event.request.url.split('#').at(0) ?? '';
    }
    // Drop events whose URL still contains a fragment (belt-and-suspenders)
    if (event.request?.url?.includes('#')) return null;

    // FIX: Was iterating event.breadcrumbs directly (an object).
    // Sentry breadcrumbs live at event.breadcrumbs.values (the array).
    // The old loop silently did nothing — fragment URLs were never scrubbed.
    if (event.breadcrumbs?.values) {
      for (const crumb of event.breadcrumbs.values) {
        if (crumb.data?.url) {
          crumb.data.url = crumb.data.url.split('#').at(0) ?? '';
        }
      }
    }

    return event;
  },
});
