// app/api/csp-report/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/csp-report
// Receives Content-Security-Policy violation reports from browsers.
//
// SECURITY FIX (M1 — serverless slot exhaustion):
//   OLD: This endpoint had NO rate limiting. An attacker could flood it with
//        fabricated CSP violation reports, consuming a serverless function slot
//        per request at zero cost (no auth required, no compute-heavy check).
//        At scale this exhausts Vercel's function concurrency, denying service
//        to real API calls.
//   NEW: Per-IP sliding window of 60 req/min. This is generous for genuine
//        browser CSP reports (which fire only on real page-load violations, not
//        in tight loops) while blocking automated floods.
//
// FILTER FIRST: Browser extensions generate a large volume of CSP violations
// (chrome-extension://, moz-extension://, safari-extension://, etc.) that are
// not our bugs. We drop those before forwarding anything to Sentry to prevent
// alert fatigue and quota burn.
//
// ALWAYS 204: CSP report-uri delivery is fire-and-forget from the browser's
// perspective. Never return 4xx/5xx — a bad status triggers browser retries
// and causes the browser to disable CSP reporting for the session.
// Rate limit exceptions return 204 (not 429) for the same reason.
//
// RUNTIME: Edge — no DB, no Prisma.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'edge';

import { getClientIp, hashIp } from '../../../lib/ip';
import { cspReportLimit }      from '../../../lib/ratelimit';

// Blocked-URI prefixes that are always extension/browser noise — not our CSP bugs
const NOISE_PREFIXES = [
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'webkit-masked-url://',
  'about:',
  'data:',
  'blob:',
] as const;

// Violated directives we never want to page on (low-signal, high-volume)
const IGNORED_DIRECTIVES = new Set([
  'report-uri',
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
  // Always 204 — never let CSP report delivery fail with a retryable status.
  // This applies to rate-limited requests too: a 429 would cause browsers to
  // retry (burning more slots) and potentially disable reporting for the session.
  try {
    // FIX M1: Rate limit before doing any work.
    const rawIp  = getClientIp(request);
    const ipHash = await hashIp(rawIp);
    const { success } = await cspReportLimit.limit(ipHash);
    if (!success) {
      // Return 204 (not 429) to prevent browser retry loops.
      return new Response(null, { status: 204 });
    }

    const body = await request.json() as CspBody;
    const report = body['csp-report'];

    if (!report || isNoise(report)) {
      return new Response(null, { status: 204 });
    }

    const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'] ?? '';
    if (dsn) {
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
