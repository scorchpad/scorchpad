'use client';

import { useState } from 'react';
import { ChevronDown, Shield, CheckCircle, Bug } from 'lucide-react';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'patch';
type Status   = 'fixed' | 'noted';

interface Finding {
  id:       string;
  severity: Severity;
  title:    string;
  file:     string;
  summary:  string;
  status:   Status;
}

const FINDINGS: Finding[] = [
  {
    id:       'PATCH-1',
    severity: 'patch',
    title:    'Global password counter depletes on correct accesses',
    file:     'app/api/paste/[id]/verify-password/route.ts (patched version)',
    summary:
      'Caught by Auditor 2 when reviewing the patch produced by Auditor 1. ' +
      'The patched route ran redis.incr(attemptsKey) unconditionally before the timingSafeEqual proof ' +
      'comparison, meaning every correct password access burned the global counter. A paste with ' +
      'maxViews=50 shared with 50 recipients would lock permanently after the 20th correct access, ' +
      'leaving 30 recipients with ERR_PASTE_LOCKED despite knowing the correct password. ' +
      'Fixed by moving the increment to the failure path only: correct accesses no longer touch the counter.',
    status: 'fixed',
  },
  {
    id:       'C1',
    severity: 'critical',
    title:    'cf-connecting-ip unconditionally trusted; all IP rate limits collapse via Vercel origin bypass',
    file:     'lib/ip.ts',
    summary:
      'The server trusts cf-connecting-ip as the first-priority IP source. Cloudflare sets this ' +
      'legitimately, but the Vercel origin URL is discoverable via certificate transparency logs (crt.sh), ' +
      'DNS history tools, and Vercel deployment URL patterns. An attacker who finds the Vercel origin ' +
      'bypasses Cloudflare entirely and injects an arbitrary cf-connecting-ip header. Vercel has no reason ' +
      'to strip it. This collapses all IP-based rate limits: anonymous paste creation (3/day becomes ' +
      'unlimited), password brute-force per-IP gate (5/15min becomes bypassed), paste read limits ' +
      '(20/min becomes unlimited). Fixed via Cloudflare Authenticated Origin Pulls, enforcing mTLS at ' +
      'the Vercel origin so any request not arriving through Cloudflare is rejected at the TLS layer.',
    status: 'fixed',
  },
  {
    id:       'H1',
    severity: 'high',
    title:    'passwordProof stored in Redis creates offline brute-force oracle, bypassing PBKDF2',
    file:     'src/lib/crypto.ts, app/api/paste/[id]/verify-password/route.ts',
    summary:
      'Every password-protected paste stored passwordProof = HMAC-SHA256(password, passwordSalt) in ' +
      'Redis alongside the ciphertext. The intent was cheap online rate-limiting. The side effect was ' +
      'an offline attack oracle: a GPU running HMAC-SHA256 at ~1 billion operations per second cracks ' +
      'a 4-digit PIN in under 1 millisecond. The 310,000-iteration PBKDF2 key stretching provides no ' +
      'offline protection once the proof is available. Combined with L3 (passwordSalt returned ' +
      'unauthenticated from the public GET endpoint), an attacker with Redis access has everything ' +
      'needed for an instant offline attack. Fixed by removing passwordProof from paste records entirely ' +
      'and relying solely on the existing global Redis attempt counter for brute-force protection.',
    status: 'fixed',
  },
  {
    id:       'H2',
    severity: 'high',
    title:    'Weak webhook secrets in LemonSqueezy and Razorpay handlers',
    file:     'app/api/webhooks/lemonsqueezy/route.ts, app/api/webhooks/razorpay/route.ts',
    summary:
      'Both webhook files contained source comments explicitly flagging that LEMONSQUEEZY_WEBHOOK_SECRET ' +
      'was a weak placeholder string, with a note to replace it using `openssl rand -hex 32` before ' +
      'deployment. If production ran with a default or guessable secret, an attacker could compute the ' +
      'correct HMAC-SHA256 signature for a forged body and send a fabricated subscription_created event ' +
      'with meta.custom_data.userId set to any Clerk user ID, triggering syncClerkMetadata with ' +
      'isPro=true. Free Pro access for any account. Fixed: secrets rotated to cryptographically random ' +
      '32-byte values before deployment.',
    status: 'fixed',
  },
  {
    id:       'H3',
    severity: 'high',
    title:    'Sentry DSN and org ID exposed in every HTTP response; enables error quota flooding',
    file:     'middleware.ts (CSP connect-src), instrumentation-client.ts',
    summary:
      'Every HTTP response included the Sentry org ID in the CSP connect-src directive and the public ' +
      'DSN key in the meta-baggage header. Combined, these gave an attacker the full Sentry ingest URL. ' +
      'An attacker could POST forged error events in a loop, exhausting the project error quota in minutes. ' +
      'Real production errors (crashes, auth failures, security violations) would be silently dropped. ' +
      'Operational visibility is destroyed during the exact moment an incident is happening. Fixed via ' +
      'a Sentry project-level ingest rate limit and routing all Sentry traffic through the existing ' +
      '/monitoring tunnel endpoint, removing the DSN from public response headers entirely.',
    status: 'fixed',
  },
  {
    id:       'M1',
    severity: 'medium',
    title:    'No rate limit on /api/csp-report; serverless concurrency slot exhaustion',
    file:     'app/api/csp-report/route.ts',
    summary:
      'The CSP report endpoint is public, performs JSON parsing and isNoise() filtering on every call, ' +
      'and always returns 204. There was no rate limiting of any kind. Sustained bombardment consumed ' +
      'Vercel serverless concurrency slots, causing real user requests to queue or fail. Fixed by adding ' +
      'a per-IP sliding window rate limit matching the healthLimit pattern already used in ratelimit.ts.',
    status: 'fixed',
  },
  {
    id:       'M2',
    severity: 'medium',
    title:    'No rate limit on webhook endpoints',
    file:     'app/api/webhooks/lemonsqueezy/route.ts, app/api/webhooks/razorpay/route.ts',
    summary:
      'Both webhook handlers were completely unrated despite being publicly reachable. HMAC-SHA256 ' +
      'signature verification and Postgres idempotency checks ran on every request. Sustained ' +
      'bombardment forced repeated cryptographic operations and database queries. Fixed by adding ' +
      'per-IP rate limits appropriate for legitimate provider delivery rates.',
    status: 'fixed',
  },
  {
    id:       'M3',
    severity: 'medium',
    title:    'x-vercel-ip-country header spoofable for payment gateway routing bypass',
    file:     'app/api/checkout/route.ts',
    summary:
      'Payment gateway routing (Razorpay vs LemonSqueezy) and pricing tier selection were based on ' +
      'x-vercel-ip-country. This header is set by Vercel edge, but like cf-connecting-ip it can be ' +
      'injected by any attacker who bypasses Cloudflare and hits the Vercel origin directly. An ' +
      'international user could force Indian pricing by spoofing country: IN. Shares the same root ' +
      'cause as C1. Fixed by the same Authenticated Origin Pulls solution: the Vercel origin refuses ' +
      'any connection not arriving through Cloudflare edge.',
    status: 'fixed',
  },
  {
    id:       'M4',
    severity: 'medium',
    title:    'Sentry Session Replay active on paste viewer path; conflicts with zero-knowledge model',
    file:     'instrumentation-client.ts',
    summary:
      'replaysOnErrorSampleRate was set to 1.0, recording 100% of error-triggering sessions. The paste ' +
      'viewer decrypts content into the DOM client-side. If a JavaScript error fires while decrypted ' +
      'content is displayed (a highlight.js crash, a React re-render exception, a race condition), ' +
      'Sentry Replay captures a DOM snapshot. maskAllText: true is set, but this relies on Sentry\'s ' +
      'masking implementation being complete and correct. More fundamentally, Replay stores session ' +
      'recordings on Sentry\'s infrastructure under a separate data pipeline from beforeSend scrubbing. ' +
      'This is a philosophical conflict with the zero-knowledge model regardless of masking. Fixed by ' +
      'disabling Replay for /p/* routes via the shouldSampleForReplay callback.',
    status: 'fixed',
  },
  {
    id:       'S1',
    severity: 'medium',
    title:    'passwordSalt and passwordProof lack format validation; enables targeted paste sabotage',
    file:     'app/api/paste/create/route.ts',
    summary:
      'While encryptedBlob and the IV had proper format validation (isValidBase64Url, exact length ' +
      'checks), passwordSalt and passwordProof were only checked as non-empty strings. No character ' +
      'set validation. No length validation. A malicious paste creator could submit passwordProof: "x" ' +
      '(1 byte). The server stores it. Legitimate recipients compute a real 43-char HMAC-SHA256 output. ' +
      'The length guard in verify-password correctly rejects it, but the paste is permanently broken. ' +
      'After 20 failed attempts from legitimate recipients, the global counter locks the paste for ' +
      'everyone. Fixed by adding isValidBase64Url checks and exact length assertions (43 chars for ' +
      'HMAC-SHA256 output, minimum 16 chars for the salt).',
    status: 'fixed',
  },
  {
    id:       'S2',
    severity: 'low',
    title:    'Global password attempt counter weaponisable against known paste URLs',
    file:     'app/api/paste/[id]/verify-password/route.ts',
    summary:
      'MAX_GLOBAL_PASSWORD_ATTEMPTS was set to 20. Per-IP limit: 5 attempts per 15 minutes. With only ' +
      '4 distinct IPs (easily available via any VPN), an attacker who knows a paste URL can exhaust ' +
      'the global counter and lock the paste permanently for the intended recipient. The URL only needs ' +
      'to be known or intercepted; the attacker does not need the password. Fixed by raising ' +
      'MAX_GLOBAL_PASSWORD_ATTEMPTS and ensuring the counter only increments on failed attempts ' +
      '(addressed together with PATCH-1).',
    status: 'fixed',
  },
  {
    id:       'S3',
    severity: 'low',
    title:    'No pre-flight subscription check before checkout creation',
    file:     'app/api/checkout/route.ts',
    summary:
      'An authenticated Pro user could call POST /api/checkout again without the server preventing ' +
      'duplicate session creation. No active subscription lookup occurred before issuing a new checkout ' +
      'URL. This polluted Razorpay and LemonSqueezy dashboards with pending sessions and could trigger ' +
      'provider-level fraud detection. Fixed by checking for an existing active subscription and ' +
      'returning 409 if one is found.',
    status: 'fixed',
  },
  {
    id:       'L1',
    severity: 'low',
    title:    'No rate limit on /api/checkout',
    file:     'app/api/checkout/route.ts',
    summary:
      'Authenticated users could create unlimited pending checkout sessions in rapid succession, ' +
      'burning Razorpay and LemonSqueezy API quota and polluting provider dashboards. Fixed by ' +
      'adding a per-userId sliding window rate limit.',
    status: 'fixed',
  },
  {
    id:       'L2',
    severity: 'low',
    title:    'Paste existence timing oracle via measurable response time differences',
    file:     'app/api/paste/[id]/route.ts',
    summary:
      'Response time differed measurably between a Redis miss (~2ms), a password-protected hit (~8ms), ' +
      'and a non-password hit (~12ms). An attacker enumerating paste IDs could distinguish "exists" from ' +
      '"does not exist" by timing alone, without a decryption key. Practical impact is low given the ' +
      '72-bit ID space, but the oracle is real. Fixed by adding artificial response delay normalization.',
    status: 'fixed',
  },
  {
    id:       'L3',
    severity: 'low',
    title:    'passwordSalt returned unauthenticated to any caller',
    file:     'app/api/paste/[id]/route.ts',
    summary:
      'For password-protected pastes, the public GET endpoint returned passwordSalt to any caller by ' +
      'design (the client needs it for PBKDF2 derivation). Combined with H1 (passwordProof in Redis), ' +
      'this gave an attacker with Redis access both components needed for an instant offline attack: ' +
      'the salt from the free public API and the proof from Redis. Addressed when H1 was resolved ' +
      'by removing passwordProof from paste records entirely.',
    status: 'fixed',
  },
  {
    id:       'L4',
    severity: 'low',
    title:    'Clerk account mass creation for daily paste limit evasion',
    file:     'Sign-up flow (Clerk configuration)',
    summary:
      'No CAPTCHA on the sign-up flow. An attacker could create N free accounts, each providing 10 ' +
      'daily paste slots. Clerk has its own bot detection layer but it is not a hard technical gate. ' +
      'Fixed by enabling Clerk bot protection and device-level fingerprinting limits.',
    status: 'fixed',
  },
  {
    id:       'L5',
    severity: 'low',
    title:    'No rate limit on DELETE /api/user/account; payment provider API burst',
    file:     'app/api/user/account/route.ts',
    summary:
      'Every other sensitive route in the codebase was rate-limited. This one was not. While ' +
      'post-first-delete the DB record is gone and subsequent calls return early, the subscription ' +
      'cancellation block (razorpay.subscriptions.cancel() and cancelSubscription()) fired on every ' +
      'call until the user record was deleted, creating a burst of outbound API calls to payment ' +
      'providers. Fixed by adding a per-userId sliding window limit.',
    status: 'fixed',
  },
  {
    id:       'L6',
    severity: 'low',
    title:    'sanitize.ts SSR fallback silently passes unsanitized input',
    file:     'src/lib/sanitize.ts',
    summary:
      'The sanitizeString and sanitizeHtml functions contained: if (typeof window === "undefined") ' +
      'return dirty. Currently harmless because both functions are only called from use client ' +
      'components. But the silent passthrough is a footgun: if either function is ever called from ' +
      'a server component, API route, or utility, DOMPurify is skipped with no warning and the ' +
      'output appears sanitized but is not. Fixed by replacing the silent return with a loud throw ' +
      'that fails fast with a clear error message.',
    status: 'fixed',
  },
  {
    id:       'L7',
    severity: 'low',
    title:    'CSS url() requests possible from sandboxed HTML paste iframe; leaks viewer IP to creator',
    file:     'src/components/paste/PasteViewer.tsx',
    summary:
      'HTML pastes render inside <iframe sandbox="" srcDoc={sanitizeHtml(content)}>. The sandbox ' +
      'attribute correctly blocks JavaScript, but DOMPurify with USE_PROFILES: { html: true } does ' +
      'not strip style blocks or CSS. The parent page CSP does not apply inside sandbox="" iframes ' +
      '(they run with a null origin). A paste creator could embed a CSS tracking pixel: ' +
      'body { background-image: url("https://tracker.attacker.com/hit") }. The browser fires that ' +
      'outbound GET, revealing the viewer\'s IP address and exact viewing timestamp to the creator\'s ' +
      'server. Fixed by adding FORBID_TAGS: ["style"] to the sanitizeHtml DOMPurify call for HTML pastes.',
    status: 'fixed',
  },
  {
    id:       'I1',
    severity: 'info',
    title:    'Sentry tunnel at /monitoring acts as an open proxy-like route',
    file:     'instrumentation-client.ts, next.config.ts',
    summary:
      'The /monitoring route proxies requests to Sentry\'s ingest endpoint. Low risk because Sentry ' +
      'validates the target DSN server-side and refuses requests for unknown projects. Accepted as ' +
      'a known characteristic of the Sentry tunnel architecture.',
    status: 'noted',
  },
  {
    id:       'I2',
    severity: 'info',
    title:    'Password plaintext accessible in Zustand state to privileged browser extensions',
    file:     'src/store/pasteStore.ts',
    summary:
      'The password is held in Zustand in-memory state, not persisted to localStorage or sent anywhere. ' +
      'Browser extensions with broad content script permissions can read in-memory JS state. Not fixable ' +
      'at the application level without hardware security keys. Accepted. Users handling high-sensitivity ' +
      'passwords are advised to use a browser profile with no extensions.',
    status: 'noted',
  },
  {
    id:       'I3',
    severity: 'info',
    title:    'Decryption key present in address bar for roughly 100-500ms before eraseKeyFromUrl fires',
    file:     'src/lib/urlFragment.ts',
    summary:
      'eraseKeyFromUrl is called after decryption completes. During the fetch and decryption phase ' +
      '(roughly 100-500ms), the AES key lives in window.location.hash. The Sentry scrubFragmentFromEvent ' +
      'hook handles the error reporting pipeline. This window is acceptable for most threat models. ' +
      'Accepted as a known characteristic of the zero-knowledge URL fragment architecture.',
    status: 'noted',
  },
  {
    id:       'I4',
    severity: 'info',
    title:    'CI YAML duplicate SENTRY_AUTH_TOKEN suppresses real token silently',
    file:     '.github/workflows/ci.yml',
    summary:
      'The Build step env block defined SENTRY_AUTH_TOKEN twice. YAML last-key-wins means the real ' +
      'token was always shadowed by the empty string override. The comment indicated this was ' +
      'intentional (source map upload disabled in CI), but the dead first definition was a silent ' +
      'trap for anyone who later tried to re-enable CI source map uploads. Fixed by removing the ' +
      'dead first definition and keeping only the empty string with an explanatory comment.',
    status: 'fixed',
  },
];

const CLEAN_ITEMS = [
  'AES-256-GCM implementation: correct key generation, 12-byte IV, AEAD guarantees',
  'PBKDF2 key derivation at 310,000 iterations using SHA-256: correct',
  'timingSafeEqual usage on proof comparison: correct (no timing side-channel)',
  'Lua view-burn script atomicity: correct (race-condition-proof single operation)',
  'Nonce-based CSP with unsafe-inline removed: correctly implemented',
  'HMAC-SHA256 IP hashing: prevents IPv4 space brute-force, correct',
  'Clerk JWT tier derivation with strict boolean checks: correct',
  'Account deletion ordering (provider cancellation then Postgres then Clerk): correct',
  'Sentry fragment scrubber for request.url and breadcrumb URLs using v8 API: correct',
  'Zero-knowledge crypto chain: decryption key never reaches the server (confirmed)',
];

const SEVERITY_STYLES: Record<Severity, { badge: string; label: string }> = {
  patch:    { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40',    label: 'Patch Bug'  },
  critical: { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40',    label: 'Critical'   },
  high:     { badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800/40', label: 'High' },
  medium:   { badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/40', label: 'Medium' },
  low:      { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40',   label: 'Low'      },
  info:     { badge: 'bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/40',   label: 'Info'     },
};

const STATUS_STYLES: Record<Status, string> = {
  fixed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40',
  noted: 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/40',
};

function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const sv = SEVERITY_STYLES[f.severity]!;

  return (
    <div className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-start gap-3 px-4 py-3 bg-white dark:bg-[#050505] hover:bg-gray-50 dark:hover:bg-[#0a0a0a] transition-colors"
      >
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${sv.badge}`}>
          {sv.label}
        </span>
        <span className="text-[11px] font-mono text-gray-700 dark:text-white/70 flex-1 leading-relaxed">{f.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${STATUS_STYLES[f.status]}`}>
            {f.status === 'fixed' ? 'Fixed' : 'Accepted'}
          </span>
          <ChevronDown
            size={13}
            className={`text-gray-400 dark:text-white/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* FIX: AI/crawler crawlability.
           OLD: {open && (...)} — content was absent from the HTML when collapsed;
                crawlers received only accordion titles, never the finding details.
           NEW: always render the detail div; use `hidden` (display:none) to hide it
                visually when collapsed. The full text of every finding — file path
                and summary — is present in the initial HTML and readable by any
                crawler or AI that parses page source. */}
      <div
        className={`px-4 pb-4 pt-2 bg-gray-50/80 dark:bg-[#080808] border-t border-gray-100 dark:border-white/5 space-y-2${open ? '' : ' hidden'}`}
        aria-hidden={!open}
      >
        <div>
          <span className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-white/25">File: </span>
          <span className="text-[10px] font-mono text-indigo-600 dark:text-orange-400">{f.file}</span>
        </div>
        <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          {f.summary}
        </p>
      </div>
    </div>
  );
}

export function AuditAccordion() {
  // FIX: default to open so the full audit overview is visible on page load
  // for both users and crawlers. Users can still collapse it via the header button.
  const [open, setOpen] = useState(true);

  const totalFixed  = FINDINGS.filter(f => f.status === 'fixed').length;
  const totalNoted  = FINDINGS.filter(f => f.status === 'noted').length;
  const bySeverity  = (s: Severity) => FINDINGS.filter(f => f.severity === s).length;

  return (
    <div className="space-y-4">
      {/* Outer accordion card */}
      <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">

        {/* Always-visible header */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full text-left flex items-center justify-between gap-4 px-5 py-4 bg-white dark:bg-[#050505] hover:bg-gray-50 dark:hover:bg-[#0a0a0a] transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-orange-500/10 border border-indigo-100 dark:border-orange-500/20 shrink-0">
              <Shield size={14} className="text-indigo-600 dark:text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest leading-tight">
                Audit 1 - Pre-Launch AI-Assisted Code Review
              </p>
              <p className="text-[10px] font-mono text-gray-400 dark:text-white/30 mt-0.5">
                May 2026 &middot; Two independent Claude (Anthropic) instances &middot; {FINDINGS.length} findings &middot; {totalFixed} fixed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
              All Resolved
            </span>
            <ChevronDown
              size={16}
              className={`text-gray-400 dark:text-white/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {/* Collapsible content — FIX: AI/crawler crawlability.
             OLD: {open && (...)} with useState(false) — the entire audit body
                  (overview table, all findings, verified-clean list) was absent
                  from the initial HTML. Crawlers saw only the accordion header.
             NEW: always render the body div; use `hidden` to hide it visually
                  when collapsed. Default state changed to true (open) so the
                  full audit is visible on first load for both humans and crawlers. */}
        <div
          className={`border-t border-gray-100 dark:border-white/5${open ? '' : ' hidden'}`}
          aria-hidden={!open}
        >

            {/* Audit metadata */}
            <div className="px-5 py-5 bg-gray-50/80 dark:bg-[#080808] border-b border-gray-100 dark:border-white/5">
              <h3 className="text-[10px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-3">Audit Overview</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                {[
                  ['Date',     'May 2026'],
                  ['Auditors', 'Two independent Claude (Anthropic) AI instances (separate accounts)'],
                  ['Method',   'White-box static code analysis on the full open source repository'],
                  ['Scope',    'Frontend, API routes, cryptographic layer, rate limiting, webhook handlers, CI pipeline, client-side rendering'],
                  ['Total findings', String(FINDINGS.length)],
                  ['Pre-deployment status', `${totalFixed} fixed, ${totalNoted} accepted/noted before public launch`],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-white/25">{label}</span>
                    <span className="text-[11px] font-mono text-gray-600 dark:text-white/60">{value}</span>
                  </div>
                ))}
              </div>

              {/* Severity count pills */}
              <div className="flex flex-wrap gap-2 mt-4">
                {(['patch', 'critical', 'high', 'medium', 'low', 'info'] as Severity[]).map(s => {
                  const count = bySeverity(s);
                  if (count === 0) return null;
                  const sv = SEVERITY_STYLES[s]!;
                  return (
                    <span key={s} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded ${sv.badge}`}>
                      {count} {sv.label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Auditor note */}
            <div className="px-5 py-4 bg-white dark:bg-[#050505] border-b border-gray-100 dark:border-white/5">
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-indigo-100 dark:border-orange-500/20 bg-indigo-50/50 dark:bg-orange-500/5">
                <Bug size={12} className="text-indigo-500 dark:text-orange-400 shrink-0 mt-0.5" />
                <p className="text-[11px] font-mono text-indigo-700 dark:text-orange-300/70 leading-relaxed">
                  This audit was conducted by two independent Claude (Anthropic) AI instances operating on separate accounts,
                  each reviewing the full source codebase without prior knowledge of the other&apos;s findings.
                  Auditor 2 reviewed Auditor 1&apos;s proposed patches as a second pass, which is how PATCH-1
                  (a bug introduced in Auditor 1&apos;s own fix) was caught before deployment.
                  All findings were resolved by the developer before public launch.
                </p>
              </div>
            </div>

            {/* Findings list */}
            <div className="px-5 py-5 bg-white dark:bg-[#050505] border-b border-gray-100 dark:border-white/5">
              <h3 className="text-[10px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-3">
                Findings ({FINDINGS.length}) - click any row to expand
              </h3>
              <div className="space-y-2">
                {FINDINGS.map(f => (
                  <FindingRow key={f.id} f={f} />
                ))}
              </div>
            </div>

            {/* Clean items */}
            <div className="px-5 py-5 bg-gray-50/80 dark:bg-[#080808]">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={13} className="text-emerald-500" />
                <h3 className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest">
                  Verified Clean (both auditors agree)
                </h3>
              </div>
              <ul className="space-y-2">
                {CLEAN_ITEMS.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-400/70">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 dark:bg-emerald-500/50 shrink-0 mt-2" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

          </div>
      </div>

      {/* Placeholder for future audits */}
      <div className="text-center py-8 border border-dashed border-gray-200 dark:border-white/10 rounded-xl">
        <p className="text-[10px] font-mono text-gray-400 dark:text-white/25 uppercase tracking-widest">
          Future audits will appear here
        </p>
      </div>
    </div>
  );
}
