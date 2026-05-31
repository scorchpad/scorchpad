// app/api/user/action-check/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user/action-check
// Returns { allowed, reason?, upgradeUrl? } for a given ScorchPad feature action.
//
// PURPOSE: Lets the editor UI know which controls to enable before the user
// attempts to create a paste. This is informational — the actual enforcement
// gate is in POST /api/paste/create (which re-validates every field regardless
// of what this endpoint returns).
//
// Why JWT claims (not DB): This is called on editor mount, not during checkout
// polling. Speed matters. A slightly-stale tier (JWT refreshes every ~60 s)
// causes a brief UI inconsistency, not a security gap — create enforces strictly.
//
// RUNTIME: Edge — no Prisma, no Node.js imports.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'edge';

import { auth } from '@clerk/nextjs/server';
import {
  deriveTierFromClaims,
  getLimits,
  getUpgradeUrl,
} from '../../../../lib/plan-limits';

// ── Types ─────────────────────────────────────────────────────────────────────

// Mirror of ScorchPadAction in src/mocks/api.mock.ts.
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

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', code: 'ERR_INVALID_BODY' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json(
      { error: 'Body must be an object', code: 'ERR_INVALID_BODY' },
      { status: 400 }
    );
  }

  const raw    = body as Record<string, unknown>;
  const action = raw['action'];

  if (!isValidAction(action)) {
    return Response.json(
      { error: `action must be one of: ${[...VALID_ACTIONS].join(', ')}`, code: 'ERR_INVALID_ACTION' },
      { status: 400 }
    );
  }

  // ── 2. Derive tier from JWT claims ─────────────────────────────────────────
  const { userId, sessionClaims } = await auth();
  const tierInfo = deriveTierFromClaims(
    userId ?? null,
    sessionClaims as Record<string, unknown> | null
  );
  const { tier, planType } = tierInfo;
  const limits = getLimits(tier, planType);

  const upgradeUrl = getUpgradeUrl();

  // ── 3. Check gate for the requested action ─────────────────────────────────
  switch (action) {
    case 'password_protection':
      if (!limits.allowPassword) {
        return Response.json({
          allowed:    false,
          reason:     'Password protection requires a free account. Sign up to enable it.',
          upgradeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/sign-up`,
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
                        : 'Extended expiry beyond 30 days requires a Pro subscription.',
          upgradeUrl,
        });
      }
      return Response.json({ allowed: true });

    case 'large_paste':
      if (!limits.allowLargePaste) {
        return Response.json({
          allowed:    false,
          reason:     tier === 'anonymous' || tier === 'free'
                        ? 'Pastes over 500 KB require a Pro subscription.'
                        : 'Large paste is not available on your current plan.',
          upgradeUrl,
        });
      }
      return Response.json({ allowed: true });

    default: {
      // TypeScript exhaustiveness check — this branch is unreachable.
      const _: never = action;
      void _;
      return Response.json(
        { error: 'Unhandled action', code: 'ERR_UNHANDLED_ACTION' },
        { status: 500 }
      );
    }
  }
}
