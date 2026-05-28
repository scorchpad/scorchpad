// src/components/ui/Badge.tsx
import { cn } from '../../lib/utils';

export function Badge({ children, className, variant = 'default' }: { children: React.ReactNode; className?: string; variant?: 'default' | 'pro' }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] tracking-widest uppercase font-bold", variant === 'pro' ? 'bg-indigo-600 dark:bg-orange-600 text-white' : 'bg-gray-200 dark:bg-white/5 border border-transparent dark:border-white/10 text-gray-700 dark:text-white/50', className)}>
      {children}
    </span>
  );
}
