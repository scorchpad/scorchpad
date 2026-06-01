// app/api/user/action-check/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user/action-check
// Returns { allowed, reason?, upgradeUrl? } for a given ScorchPad action.
//
// FIX: password_protection now correctly reports "requires a Pro subscription"
// (was "requires a free account" — wrong per spec A.6 which gates password on Pro).
//
// RUNTIME: Edge — no Prisma.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'edge';

import { auth } from '@clerk/nextjs/server';
import {
  deriveTierFromClaims,
  getLimits,
  getUpgradeUrl,
} from '../../../../lib/plan-limits';

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

  const { userId, sessionClaims } = await auth();
  const tierInfo = deriveTierFromClaims(
    userId ?? null,
    sessionClaims as Record<string, unknown> | null
  );
  const { tier, planType } = tierInfo;
  const limits = getLimits(tier, planType);
  const upgradeUrl = getUpgradeUrl();

  switch (action) {
    case 'password_protection':
      if (!limits.allowPassword) {
        return Response.json({
          allowed:    false,
          // FIXED: was "requires a free account" — password is Pro-only per spec
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
