// src/components/ui/Spinner.tsx
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-spin rounded-full border-t-2 border-b-2 border-current ${className}`} style={{ width: '1em', height: '1em' }}></div>
  );
}
