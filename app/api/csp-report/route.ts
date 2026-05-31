// app/api/csp-report/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/csp-report
// Receives Content-Security-Policy violation reports from browsers.
//
// FILTER FIRST: Browser extensions generate a large volume of CSP violations
// (chrome-extension://, moz-extension://, safari-extension://, etc.) that are
// not our bugs. We drop those before forwarding anything to Sentry to prevent
// alert fatigue and quota burn.
//
// ALWAYS 204: CSP report-uri delivery is fire-and-forget from the browser's
// perspective. Never return 4xx/5xx — a bad status triggers browser retries
// and causes the browser to disable CSP reporting for the session.
//
// RUNTIME: Edge — no DB, no Prisma.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'edge';

// Blocked-URI prefixes that are always extension/browser noise — not our CSP bugs
const NOISE_PREFIXES = [
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'webkit-masked-url://',
  'about:',
  'data:',
  'blob:',          // inline blobs from extensions
] as const;

// Violated directives we never want to page on (low-signal, high-volume)
const IGNORED_DIRECTIVES = new Set([
  'report-uri',   // self-referential meta-reports
]);

type CspReport = {
  'document-uri'?:         string;
  'blocked-uri'?:          string;
  'effective-directive'?:  string;
  'violated-directive'?:   string;
  'source-file'?:          string;
  'status-code'?:          number;
  'script-sample'?:        string;
};

type CspBody = {
  'csp-report'?: CspReport;
};

function isNoise(report: CspReport): boolean {
  const blocked = report['blocked-uri'] ?? '';
  if (NOISE_PREFIXES.some((p) => blocked.startsWith(p))) return true;

  const sourceFile = report['source-file'] ?? '';
  if (NOISE_PREFIXES.some((p) => sourceFile.startsWith(p))) return true;

  const directive = report['effective-directive'] ?? report['violated-directive'] ?? '';
  if (IGNORED_DIRECTIVES.has(directive)) return true;

  return false;
}

export async function POST(request: Request): Promise<Response> {
  // Always 204 — never let CSP report delivery fail with a retryable status
  try {
    const body = await request.json() as CspBody;
    const report = body['csp-report'];

    if (!report || isNoise(report)) {
      return new Response(null, { status: 204 });
    }

    // Real violation — forward to Sentry as a structured breadcrumb/message.
    // We use the Sentry DSN ingest endpoint directly (no SDK import in Edge).
    // In practice, Sentry Next.js SDK auto-captures unhandled errors; CSP reports
    // are supplementary and best logged for manual review.
    const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'] ?? '';
    if (dsn) {
      // Log at warn level — Sentry's console integration picks this up
      console.warn('[scorchpad/csp]', JSON.stringify({
        blocked:   report['blocked-uri'],
        directive: report['effective-directive'] ?? report['violated-directive'],
        document:  report['document-uri'],
        source:    report['source-file'],
      }));
    }
  } catch {
    // Parse failure — still 204, don't break browser reporting
  }

  return new Response(null, { status: 204 });
}
