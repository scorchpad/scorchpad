// app/api/user/action-check/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user/action-check
// Returns { allowed, reason?, upgradeUrl? } for a given ScorchPad action.
//
// SECURITY FIXES (this version):
//
//   FIX #5 — Rate limiting added:
//     This endpoint was completely unrated. Because it exposes tier capability
//     data (which features are allowed for the caller's plan), an attacker with
//     a stolen or guessed session token could rapidly enumerate all feature gates
//     to precisely map out the target account's tier, plan type, and access level.
//     Combined with account takeover, this accelerates privilege mapping.
//
//     Limit: 30 req/min per identity (userId for authenticated, ipHash for
//     anonymous). This is generous for real user interaction (clicking feature
//     gates) while blocking automated enumeration.
//
//     The Edge runtime is retained — Upstash rate limiting works on Edge.
//
//   NOTE (EXISTING FIX): password_protection correctly reports "requires a Pro
//   subscription" (was "requires a free account" — wrong per spec A.6 which
//   gates password protection on Pro, not free).
//
// RUNTIME: Edge — no Prisma. Upstash Ratelimit works on Edge runtime.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'edge';

import { auth } from '@clerk/nextjs/server';
import {
  deriveTierFromClaims,
  getLimits,
  getUpgradeUrl,
} from '../../../../lib/plan-limits';
import { getClientIp, hashIp } from '../../../../lib/ip';
import { actionCheckLimit } from '../../../../lib/ratelimit';

type ScorchPadAction =
  | 'unlimited_views'
  | 'custom_views'
  | 'password_protection'
  | 'extended_expiry'
  | 'large_paste';

const VALID_ACTIONS = new Set<ScorchPadAction>([
  'unlimited_views',
  'custom_views',
  'password_protection',
  'extended_expiry',
  'large_paste',
]);

function isValidAction(v: unknown): v is ScorchPadAction {
  return typeof v === 'string' && VALID_ACTIONS.has(v as ScorchPadAction);
}

export async function POST(request: Request): Promise<Response> {
  // ── FIX #5: Rate limiting ──────────────────────────────────────────────────
  // Must run before auth() to block abuse before any Clerk network call.
  // Identifier: userId for authenticated callers, ipHash for anonymous.
  // We derive userId cheaply from the JWT without a network call for the key.
  const { userId, sessionClaims } = await auth();

  let rateLimitId: string;
  if (userId) {
    rateLimitId = userId;
  } else {
    const rawIp = getClientIp(request);
    rateLimitId = await hashIp(rawIp);
  }

  const { success, reset } = await actionCheckLimit.limit(rateLimitId);
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return Response.json(
      { error: 'Too many requests. Please slow down.', code: 'ERR_RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'Retry-After':   String(retryAfter),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON body', code: 'ERR_INVALID_BODY' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Body must be an object', code: 'ERR_INVALID_BODY' }, { status: 400 });
  }

  const raw    = body as Record<string, unknown>;
  const action = raw['action'];

  if (!isValidAction(action)) {
    return Response.json(
      { error: `action must be one of: ${[...VALID_ACTIONS].join(', ')}`, code: 'ERR_INVALID_ACTION' },
      { status: 400 }
    );
  }

  // ── Tier & limits ──────────────────────────────────────────────────────────
  const tierInfo = deriveTierFromClaims(
    userId ?? null,
    sessionClaims as Record<string, unknown> | null
  );
  const { tier, planType } = tierInfo;
  const limits     = getLimits(tier, planType);
  const upgradeUrl = getUpgradeUrl();

  // ── Feature gate checks ────────────────────────────────────────────────────
  switch (action) {
    case 'password_protection':
      if (!limits.allowPassword) {
        return Response.json({
          allowed:    false,
          reason:     'Password protection requires a Pro subscription.',
          upgradeUrl,
        });
      }
      return Response.json({ allowed: true });

    case 'custom_views':
      if (!limits.allowCustomViews) {
        return Response.json({
          allowed:    false,
          reason:     tier === 'anonymous'
                        ? 'Custom view counts require a free account or higher.'
                        : 'Custom view counts require a Pro subscription.',
          upgradeUrl,
        });
      }
      return Response.json({ allowed: true });

    case 'unlimited_views':
      if (!limits.allowUnlimitedViews) {
        return Response.json({
          allowed:    false,
          reason:     'Unlimited views require an Annual Pro subscription.',
          upgradeUrl: `${upgradeUrl}#annual`,
        });
      }
      return Response.json({ allowed: true });

    case 'extended_expiry':
      if (!limits.allowExtendedExpiry) {
        return Response.json({
          allowed:    false,
          reason:     tier === 'anonymous'
                        ? 'Extended expiry requires a free account or higher.'
                        : 'Extended expiry beyond 24 hours requires a Pro subscription.',
          upgradeUrl,
        });
      }
      return Response.json({ allowed: true });

    case 'large_paste':
      if (!limits.allowLargePaste) {
        return Response.json({
          allowed:    false,
          reason:     'Pastes over 50 KB require a Pro subscription.',
          upgradeUrl,
        });
      }
      return Response.json({ allowed: true });

    default: {
      const _: never = action;
      void _;
      return Response.json({ error: 'Unhandled action', code: 'ERR_UNHANDLED_ACTION' }, { status: 500 });
    }
  }
}
