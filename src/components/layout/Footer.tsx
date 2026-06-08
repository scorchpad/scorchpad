import Link from 'next/link';

export function Footer() {
  return (
    <footer className="w-full h-8 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] flex items-center justify-center px-6 fixed bottom-0 z-50 transition-colors">
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
        <Link href="/about" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">About</Link>
        <Link href="/pricing" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Pricing</Link>
        <Link href="/privacy" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Privacy</Link>
        <Link href="/terms" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Terms</Link>
        <Link href="/security" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Security</Link>
        <Link href="/audit" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Audit</Link>
        <Link href="/warrant-canary" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Canary</Link>
      </div>
    </footer>
  );
}
