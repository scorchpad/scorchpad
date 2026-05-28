import Link from 'next/link';

export function Footer() {
  return (
    <footer className="w-full h-16 sm:h-8 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] flex flex-col sm:flex-row items-center justify-between px-6 fixed bottom-0 z-50 transition-colors">
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6 pt-2 sm:pt-0">
        <span className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest">Status: <span className="text-emerald-600 dark:text-emerald-500">Ready</span></span>
        <span className="hidden md:inline text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest">Region: <span className="text-gray-700 dark:text-white/60">US-East (Local Encryption)</span></span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 mb-2 sm:mb-0">
        <Link href="/about" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">About</Link>
        <Link href="/pricing" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Pricing</Link>
        <Link href="/privacy" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Privacy</Link>
        <Link href="/terms" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Terms</Link>
        <Link href="/warrant-canary" className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition">Canary</Link>
      </div>

      <div className="hidden sm:flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-orange-500"></div>
        <span className="text-[10px] text-gray-500 dark:text-white/30 uppercase tracking-widest">Server-Side: Disabled</span>
      </div>
    </footer>
  );
}
