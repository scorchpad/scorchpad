// src/types/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for ScorchPad.
//
// These are re-exported from api.mock.ts so call-sites import from here.
// When Claude replaces api.mock.ts with real implementations during backend
// wiring, these exports remain stable — consumers don't need updating.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  UserTier,
  PlanDuration,
  UserSubscription,
  CreatePasteRequest,
  CreatePasteResponse,
  GetPasteResponse,
  VerifyPasswordResponse,
} from '../mocks/api.mock';

// ── Paste creation step ───────────────────────────────────────────────────────
// Used by usePasteCreator and PasteEditor to show granular loading labels.
// 'deriving' corresponds to the ~500ms PBKDF2 step (Gotcha #17).
export type CreatingStep = 'idle' | 'deriving' | 'encrypting' | 'uploading';

// ── Pricing ───────────────────────────────────────────────────────────────────
export interface PricingFeature {
  text: string;
  included: boolean;
}

// ── Viewer error codes ────────────────────────────────────────────────────────
// Kept as a literal union so error rendering in PasteViewer is exhaustive.
export type ViewerError =
  | 'not_found'       // paste missing or expired
  | 'missing_key'     // URL has no #fragment
  | 'decrypt_failed'; // AES-GCM threw (wrong key or corrupted blob)

// ── Password prompt step ──────────────────────────────────────────────────────
// 'deriving' = PBKDF2 key derivation in progress.
// 'decrypting' = AES-GCM decrypt in progress (fast, <10ms).
export type DecryptStep = 'idle' | 'deriving' | 'decrypting';
