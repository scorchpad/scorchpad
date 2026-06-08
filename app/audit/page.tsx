import type { Metadata } from 'next';
import { AuditAccordion } from '../../src/components/AuditAccordion';

export const metadata: Metadata = {
  title: 'Security Audit Log',
  description:
    'ScorchPad security audit history. Pre-launch AI-assisted code review conducted by two ' +
    'independent Claude (Anthropic) instances. All findings resolved before public deployment.',
  robots: { index: true, follow: true },
  alternates: {
    types: {
      'text/plain': 'https://scorchpad.rsaatlabs.com/llms-full.txt',
    },
  },
};

export default function AuditPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">

      {/* Hero */}
      <div className="mb-14">
        <p className="text-[10px] font-mono text-indigo-600 dark:text-orange-500 uppercase tracking-[0.3em] mb-3">
          Security Audit Log
        </p>
        <h1 className="text-4xl font-bold tracking-tighter mb-4 text-gray-900 dark:text-white">
          Transparent history of every code review.
        </h1>
        <p className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          ScorchPad maintains a public audit log of all security reviews conducted on the codebase.
          Each entry records who reviewed the code, the date, the method, every finding, and the current
          status of each issue. All reviews are performed against the open source repository at{' '}
          <a
            href="https://github.com/scorchpad/scorchpad"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80 transition-opacity"
          >
            github.com/scorchpad/scorchpad
          </a>
          .
        </p>
      </div>

      {/* What counts as an audit */}
      <section className="mb-10 p-5 border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#050505]">
        <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-3">
          What this log covers
        </h2>
        <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide mb-3">
          An entry appears here for every structured review of the ScorchPad source: AI-assisted static analysis,
          community contributions from external researchers, and (when commissioned) reports from independent
          security firms. Each entry includes the auditor identity, scope, all findings regardless of severity,
          and resolution status.
        </p>
        <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
          An AI-assisted review is a meaningful signal about implementation correctness, particularly for
          code that wraps well-specified primitives like the Web Crypto API. It differs from adversarial
          testing and dynamic analysis by a human auditor. Both facts are stated plainly. See the
          Security page at{' '}
          <a href="/security" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">
            /security
          </a>{' '}
          for the responsible disclosure policy and contact details.
        </p>
      </section>

      {/* Accordion entries */}
      <AuditAccordion />

    </div>
  );
}
