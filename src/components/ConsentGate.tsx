'use client';
import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';

const CONSENT_KEY = 'sp_consent_v2';

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const [showModal, setShowModal] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(CONSENT_KEY) === 'accepted') {
        setShowModal(false);
      }
    } catch {}
  }, []);

  const handleAccept = () => {
    try { localStorage.setItem(CONSENT_KEY, 'accepted'); } catch {}
    setShowModal(false);
  };

  const handleDecline = () => {
    window.location.replace('https://www.google.com');
  };

  useEffect(() => {
    if (!showModal) return;
    const block = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', block, true);
    return () => window.removeEventListener('keydown', block, true);
  }, [showModal]);

  return (
    <>
      {children}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-8">

            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-indigo-600 dark:bg-orange-600 rounded flex items-center justify-center shrink-0">
                <div className="w-4 h-4 border-2 border-white rotate-45" />
              </div>
              <span className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">
                SCORCH<span className="text-indigo-600 dark:text-orange-500">PAD</span>
              </span>
            </div>

            {/* Badge */}
            <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-indigo-50 dark:bg-orange-500/10 border border-indigo-100 dark:border-orange-500/20 rounded-lg w-fit">
              <Shield size={13} className="text-indigo-600 dark:text-orange-400" />
              <span className="text-[10px] font-mono text-indigo-600 dark:text-orange-400 uppercase tracking-widest">
                Zero-Knowledge Encrypted
              </span>
            </div>

            <h2 className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white mb-3">
              Before you continue
            </h2>

            <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed mb-5">
              By continuing, you agree to our{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">
                Privacy Policy
              </a>.
            </p>

            <ul className="space-y-2 mb-7">
              {[
                'This service is provided as-is with no warranties.',
                'You are solely responsible for any content you share.',
                'Do not use this service for illegal purposes.',
                'We cannot access your encrypted content by design.',
                'You must be 13 or older to use this service.',
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-[11px] font-mono text-gray-500 dark:text-white/40">
                  <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
                  {point}
                </li>
              ))}
            </ul>

            <div className="flex gap-3">
              <button
                onClick={handleAccept}
                className="flex-1 py-3 bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-500 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all shadow-md"
              >
                I Agree — Continue
              </button>
              <button
                onClick={handleDecline}
                className="px-5 py-3 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all"
              >
                Decline
              </button>
            </div>

            <p className="text-[9px] font-mono text-gray-300 dark:text-white/20 mt-4 text-center tracking-wide">
              Declining will redirect you away from this site.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
