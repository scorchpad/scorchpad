// src/components/ui/TrustBadges.tsx
import { Lock, EyeOff, Flame } from 'lucide-react';

export function TrustBadges() {
  return (
    <div className="flex flex-wrap gap-6 text-[10px] text-gray-600 dark:text-white/40 uppercase tracking-widest mt-4 justify-center font-mono transition-colors">
      <div className="flex items-center gap-1.5"><Lock size={14} className="text-indigo-600 dark:text-orange-500" /> <span>E2E Encrypted</span></div>
      <div className="flex items-center gap-1.5"><EyeOff size={14} className="text-indigo-600 dark:text-orange-500" /> <span>Zero Knowledge Servers</span></div>
      <div className="flex items-center gap-1.5"><Flame size={14} className="text-indigo-600 dark:text-orange-500" /> <span>Auto-Deletes Payload</span></div>
    </div>
  );
}
