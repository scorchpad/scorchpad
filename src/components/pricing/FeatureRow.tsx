import { Check, X } from 'lucide-react';

export function FeatureRow({ included, text }: { included: boolean, text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-white/70 font-medium">
      {included ? <Check size={16} className="text-emerald-600 dark:text-emerald-500 shrink-0" /> : <X size={16} className="text-gray-300 dark:text-white/20 shrink-0" />}
      <span className={!included ? 'text-gray-400 dark:text-white/30 line-through' : ''}>{text}</span>
    </li>
  );
}
