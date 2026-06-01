// src/components/ui/Spinner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight CSS-only loading spinner.
//
// Props:
//   className? – additional Tailwind classes (e.g. "text-indigo-500")
//   size?      – explicit pixel dimension for width & height.
//                Omit to inherit the current font-size via "1em"
//                (good for inline/text-adjacent usage).
//
// FIX: Added `size?: number` prop.
//   PasteEditor uses <Spinner size={16} /> — the prop was missing from the
//   original type definition, causing a TypeScript build error:
//   "Property 'size' does not exist on type …"
//   Both existing call sites remain fully compatible:
//     <Spinner />          → width/height: 1em  (PasswordPrompt, unchanged)
//     <Spinner size={16} /> → width/height: 16px (PasteEditor, now valid)
// ─────────────────────────────────────────────────────────────────────────────

export function Spinner({
  className = '',
  size,
}: {
  className?: string;
  size?: number;
}) {
  const dimension = size !== undefined ? `${size}px` : '1em';

  return (
    <div
      className={`animate-spin rounded-full border-t-2 border-b-2 border-current ${className}`}
      style={{ width: dimension, height: dimension }}
    />
  );
}
