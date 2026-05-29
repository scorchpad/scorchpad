import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">
      <h1 className="text-3xl font-bold tracking-tighter mb-2 text-gray-900 dark:text-white">Terms of Service</h1>
      <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 mb-10 tracking-wide">Last updated: May 28, 2026</p>

      {/* Disclaimer box */}
      <div className="mb-10 p-4 border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/5 rounded-xl">
        <p className="text-[11px] font-mono text-yellow-700 dark:text-yellow-400 leading-relaxed tracking-wide">
          PLEASE READ THESE TERMS CAREFULLY. BY ACCESSING OR USING SCORCHPAD, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT USE THIS SERVICE.
        </p>
      </div>

      {[
        {
          title: '1. Acceptance of Terms',
          body: `By accessing or using ScorchPad ("the Service"), you agree to these Terms of Service ("Terms"). These Terms constitute a legally binding agreement between you and Rsaat Labs ("we", "us", "our"). If you do not agree to these Terms, you must immediately stop using the Service.`,
        },
        {
          title: '2. Description of Service',
          body: `ScorchPad is a zero-knowledge encrypted text sharing service. The Service is provided on an "AS IS" and "AS AVAILABLE" basis without any warranties of any kind, express or implied. We reserve the right to modify, suspend, or discontinue the Service at any time without notice or liability.`,
        },
        {
          title: '3. Eligibility',
          body: `You must be at least 13 years of age to use this Service. By using the Service, you represent and warrant that you meet this requirement. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.`,
        },
        {
          title: '4. Prohibited Uses',
          body: `You agree not to use the Service to:\n\n— Store, share, or transmit any content that is illegal under applicable laws\n— Distribute malware, viruses, or any harmful code\n— Infringe any intellectual property rights\n— Harass, threaten, or harm any individual\n— Share child sexual abuse material (CSAM) — this will result in immediate reporting to law enforcement\n— Engage in fraud, phishing, or social engineering\n— Attempt to circumvent our technical security measures\n— Use the Service in a way that violates any applicable local, national, or international law\n\nViolation of these prohibitions may result in immediate termination of your access and, where required by law, reporting to appropriate authorities.`,
        },
        {
          title: '5. User Content and Responsibility',
          body: `You are solely and entirely responsible for any content you create, encrypt, and share using the Service. We do not monitor, review, or access your encrypted content — it is technically inaccessible to us by design. By using the Service, you acknowledge that:\n\n— You own or have the necessary rights to share any content you encrypt\n— You bear full legal responsibility for the content you share\n— We have no ability to review, filter, or remove encrypted content\n— We are not liable for any content shared through the Service`,
        },
        {
          title: '6. Disclaimer of Warranties',
          body: `THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RSAAT LABS EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.\n\nWE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. WE DO NOT WARRANT THAT ANY DATA WILL BE PRESERVED OR NOT LOST.`,
        },
        {
          title: '7. Limitation of Liability',
          body: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL RSAAT LABS, ITS OPERATORS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, REVENUE, DATA, BUSINESS, OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.\n\nOUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR ₹100 (ONE HUNDRED RUPEES), WHICHEVER IS GREATER.`,
        },
        {
          title: '8. Indemnification',
          body: `You agree to indemnify, defend, and hold harmless Rsaat Labs and its operators from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or in any way connected with: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any applicable law; or (d) any content you share through the Service.`,
        },
        {
          title: '9. Zero-Knowledge Architecture — No Liability for Encrypted Content',
          body: `ScorchPad is built on a zero-knowledge architecture. All encryption and decryption occurs client-side in your browser. We never possess decryption keys and are technically incapable of accessing paste content. Accordingly, we bear no liability for the nature, legality, or consequences of any content that passes through our systems in encrypted form. The encrypted blob stored on our servers is, to us, meaningless data.`,
        },
        {
          title: '10. Service Availability and Data Loss',
          body: `We make no guarantee of uptime, availability, or data persistence. Pastes are automatically deleted at expiry or upon reaching the maximum view count. Do not rely on ScorchPad as a backup or long-term storage solution. We are not liable for any data loss resulting from paste expiry, server failures, or service discontinuation.`,
        },
        {
          title: '11. Account Termination',
          body: `We reserve the right to suspend or terminate your account and access to the Service at our sole discretion, at any time, for any reason, including violation of these Terms, without notice or liability.`,
        },
        {
          title: '12. Governing Law',
          body: `These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the courts located in India.`,
        },
        {
          title: '13. Changes to Terms',
          body: `We reserve the right to modify these Terms at any time. Changes will be effective upon posting to this page. Continued use of the Service after changes constitutes your acceptance of the updated Terms.`,
        },
        {
          title: '14. Contact',
          body: `For any questions regarding these Terms: rsaatlabs@gmail.com`,
        },
      ].map(({ title, body }) => (
        <section key={title} className="mb-8">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white tracking-tight mb-3 uppercase">
            {title}
          </h2>
          <div className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide whitespace-pre-line border-l-2 border-gray-100 dark:border-white/5 pl-4">
            {body}
          </div>
        </section>
      ))}
    </div>
  );
}
