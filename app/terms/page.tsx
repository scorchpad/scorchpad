import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  robots: { index: true, follow: true },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xs font-bold text-gray-900 dark:text-white tracking-widest uppercase mb-4 pb-2 border-b border-gray-100 dark:border-white/5">
        {title}
      </h2>
      <div className="text-[12px] font-mono text-gray-500 dark:text-white/50 leading-relaxed tracking-wide">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5 pl-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <div className="pt-12 pb-24 max-w-3xl mx-auto w-full px-4">
      <h1 className="text-3xl font-bold tracking-tighter mb-2 text-gray-900 dark:text-white">Terms of Service</h1>
      <p className="text-[11px] font-mono text-gray-400 dark:text-white/30 mb-6 tracking-wide">Last updated: May 28, 2026</p>

      <div className="mb-10 p-4 border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/5 rounded-xl">
        <p className="text-[11px] font-mono text-yellow-700 dark:text-yellow-400 leading-relaxed tracking-wide">
          PLEASE READ THESE TERMS CAREFULLY. BY ACCESSING OR USING SCORCHPAD, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT USE THIS SERVICE.
        </p>
      </div>

      <Section title="1. Acceptance of Terms">
        By accessing or using ScorchPad ("the Service"), you agree to these Terms of Service ("Terms"). These Terms constitute a legally binding agreement between you and Rsaat Labs ("we", "us", "our"). If you do not agree to these Terms, you must immediately stop using the Service.
      </Section>

      <Section title="2. Description of Service">
        ScorchPad is a zero-knowledge encrypted text sharing service. The Service is provided on an "AS IS" and "AS AVAILABLE" basis without any warranties of any kind, express or implied. We reserve the right to modify, suspend, or discontinue the Service at any time without notice or liability.
      </Section>

      <Section title="3. Eligibility">
        You must be at least 13 years of age to use this Service. By using the Service, you represent and warrant that you meet this requirement. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
      </Section>

      <Section title="4. Prohibited Uses">
        <p>You agree not to use the Service to:</p>
        <List items={[
          'Store, share, or transmit any content that is illegal under applicable laws',
          'Distribute malware, viruses, or any harmful code',
          'Infringe any intellectual property rights',
          'Harass, threaten, or harm any individual',
          'Share child sexual abuse material (CSAM) — will result in immediate reporting to law enforcement',
          'Engage in fraud, phishing, or social engineering',
          'Attempt to circumvent our technical security measures',
          'Use the Service in a way that violates any applicable local, national, or international law',
        ]} />
        <p className="mt-4">Violation of these prohibitions may result in immediate termination of your access and, where required by law, reporting to appropriate authorities.</p>
      </Section>

      <Section title="5. User Content and Responsibility">
        <p>You are solely and entirely responsible for any content you create, encrypt, and share using the Service. We do not monitor, review, or access your encrypted content — it is technically inaccessible to us by design. By using the Service, you acknowledge that:</p>
        <List items={[
          'You own or have the necessary rights to share any content you encrypt',
          'You bear full legal responsibility for the content you share',
          'We have no ability to review, filter, or remove encrypted content',
          'We are not liable for any content shared through the Service',
        ]} />
      </Section>

      <Section title="6. Disclaimer of Warranties">
        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RSAAT LABS EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
      </Section>

      <Section title="7. Limitation of Liability">
  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RSAAT LABS, ITS OPERATORS, AND ANY AFFILIATED PERSONS SHALL HAVE ABSOLUTELY NO LIABILITY OF ANY KIND — LEGAL, EQUITABLE, CONTRACTUAL, TORTIOUS, STATUTORY, OR OTHERWISE — ARISING OUT OF OR IN CONNECTION WITH THIS SERVICE OR THESE TERMS.

  <p className="mt-4">THIS INCLUDES, WITHOUT LIMITATION, ANY LIABILITY FOR:</p>
  <ul className="mt-3 space-y-1.5 pl-1">
    {[
      'Loss of data, pastes, content, or access',
      'Loss of revenue, profits, business, or goodwill',
      'Service interruptions, downtime, or outages',
      'Unauthorized access to or alteration of your data',
      'Conduct or content of any third party using the Service',
      'Any damages resulting from viruses, malware, or security vulnerabilities',
      'Any indirect, incidental, special, punitive, or consequential damages of any nature',
    ].map((item) => (
      <li key={item} className="flex items-start gap-2.5">
        <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-white/30 shrink-0 mt-2" />
        <span>{item}</span>
      </li>
    ))}
  </ul>

  <p className="mt-4">WHETHER OR NOT RSAAT LABS HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES, AND REGARDLESS OF THE THEORY OF LIABILITY.</p>

  <p className="mt-4">IF, DESPITE THE FOREGOING, A COURT OF COMPETENT JURISDICTION FINDS RSAAT LABS LIABLE FOR ANY REASON WHATSOEVER, OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS COMBINED SHALL NOT EXCEED ₹1 (ONE RUPEE). NO EXCEPTIONS. NO NEGOTIATIONS. NO REFUNDS.</p>

  <p className="mt-4">BY USING THIS SERVICE, YOU EXPRESSLY WAIVE ANY RIGHT TO SEEK DAMAGES OF ANY KIND FROM RSAAT LABS. IF YOU DO NOT ACCEPT THIS, YOUR ONLY REMEDY IS TO STOP USING THE SERVICE IMMEDIATELY.</p>
</Section>

      <Section title="8. Indemnification">
        You agree to indemnify, defend, and hold harmless Rsaat Labs and its operators from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or in any way connected with your use of the Service, your violation of these Terms, or any content you share through the Service.
      </Section>

      <Section title="9. Zero-Knowledge Architecture">
        ScorchPad is built on a zero-knowledge architecture. All encryption and decryption occurs client-side in your browser. We never possess decryption keys and are technically incapable of accessing paste content. Accordingly, we bear no liability for the nature, legality, or consequences of any content that passes through our systems in encrypted form.
      </Section>

      <Section title="10. Service Availability and Data Loss">
        We make no guarantee of uptime, availability, or data persistence. Pastes are automatically deleted at expiry or upon reaching the maximum view count. Do not rely on ScorchPad as a backup or long-term storage solution. We are not liable for any data loss resulting from paste expiry, server failures, or service discontinuation.
      </Section>

      <Section title="11. Account Termination">
        We reserve the right to suspend or terminate your account and access to the Service at our sole discretion, at any time, for any reason, including violation of these Terms, without notice or liability.
      </Section>

      <Section title="12. Governing Law">
        These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the courts located in India.
      </Section>

      <Section title="13. Changes to Terms">
        We reserve the right to modify these Terms at any time. Changes will be effective upon posting to this page. Continued use of the Service after changes constitutes your acceptance of the updated Terms.
      </Section>

      <Section title="14. Contact">
        For any questions regarding these Terms: <a href="mailto:rsaatlabs@gmail.com" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">rsaatlabs@gmail.com</a>
      </Section>
    </div>
  );
}
