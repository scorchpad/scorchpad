import type { Metadata } from 'next';

// Statically pre-generate at build time — makes page immediately crawlable
// by AI agents and search engines without hitting the Next.js server runtime.
export const dynamic = 'force-static';


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

      {/* Yellow — read carefully */}
      <div className="mb-6 p-4 border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/5 rounded-xl">
        <p className="text-[11px] font-mono text-yellow-700 dark:text-yellow-400 leading-relaxed tracking-wide">
          PLEASE READ THESE TERMS CAREFULLY BEFORE USING SCORCHPAD. BY ACCESSING OR USING THIS SERVICE IN ANY WAY, YOU UNCONDITIONALLY AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE TO EVERY PROVISION, YOU MUST IMMEDIATELY CEASE ALL USE OF THE SERVICE.
        </p>
      </div>

      {/* Red — plain English nuclear disclaimer */}
      <div className="mb-10 p-5 border-2 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/5 rounded-xl">
        <p className="text-[10px] font-bold font-mono text-red-700 dark:text-red-400 uppercase tracking-widest mb-3">
          Plain Language Declaration — Read This First
        </p>
        <p className="text-[13px] font-bold text-red-800 dark:text-red-300 leading-relaxed mb-4">
          RSAAT LABS AND ITS OPERATOR HOLD ZERO LEGAL RESPONSIBILITY AND ZERO LIABILITY — FOR ANYTHING. WE ARE NOT LIABLE UNDER ANY LEGAL, NON-LEGAL, CIVIL, CRIMINAL, REGULATORY, OR ANY OTHER SCENARIO, HOWSOEVER ARISING, IN CONNECTION WITH THIS SERVICE OR ANYTHING DONE THROUGH IT.
        </p>
        <p className="text-[11px] font-mono text-red-700/80 dark:text-red-400/70 leading-relaxed tracking-wide">
          This means: if something goes wrong — your data is lost, your content is exposed, the service goes down, someone uses the service illegally, a government comes knocking, a third party sues, or any other bad thing happens — Rsaat Labs bears no responsibility whatsoever. None. You use this service entirely at your own risk. The detailed legal terms below explain this in full, but this plain-language statement is the summary: we are not responsible for anything, ever, under any circumstances.
        </p>
      </div>

      <Section title="1. Acceptance of Terms">
        By accessing, browsing, creating an account on, or using ScorchPad in any manner ("the Service"), you ("User", "you", "your") unconditionally accept and agree to be legally bound by these Terms of Service ("Terms"). These Terms form a binding legal agreement between you and Rsaat Labs ("we", "us", "our", "Rsaat Labs", "the Operator"). Your continued use of the Service constitutes ongoing acceptance. If you do not accept these Terms in their entirety, your only recourse is to immediately discontinue all use of the Service.
      </Section>

      <Section title="2. Description of Service">
        ScorchPad is a zero-knowledge encrypted text sharing service. Content is encrypted client-side in your browser using AES-256-GCM before transmission. We store only encrypted ciphertext and never possess decryption keys. The Service is provided strictly on an "AS IS", "AS AVAILABLE", and "WITH ALL FAULTS" basis. We make no representations whatsoever about fitness, reliability, availability, or security. We reserve the absolute right to modify, restrict, suspend, or permanently discontinue the Service or any part thereof at any time, with or without notice, for any reason or no reason, with zero liability.
      </Section>

      <Section title="3. Eligibility">
        You must be at least 13 years of age to use this Service. By using the Service, you irrevocably represent and warrant that you meet this age requirement and have the full legal capacity to enter into these Terms. If you are using the Service on behalf of an organization, you represent that you have full authority to bind that organization. We reserve the right to deny access to any person at any time for any reason.
      </Section>

      <Section title="4. Prohibited Uses">
        <p>You absolutely, unconditionally, and without exception agree not to use the Service for:</p>
        <List items={[
          'Any content that is illegal under any applicable law, anywhere in the world',
          'Child sexual abuse material (CSAM) in any form — see Section 4A',
          'Terrorism, terrorist financing, incitement to violence, or extremist content',
          'Distribution of malware, ransomware, spyware, viruses, or any harmful code',
          'Any content that harasses, threatens, stalks, or harms any person',
          'Fraud, phishing, identity theft, or social engineering attacks',
          'Intellectual property infringement of any kind',
          'Unauthorized access to computer systems or networks',
          'Money laundering or financing of any illegal activity',
          'Drug trafficking or solicitation of illegal substances',
          'Human trafficking or exploitation of any person',
          'Any violation of applicable local, national, or international law',
          'Circumventing, disabling, or interfering with our security measures',
        ]} />
        <p className="mt-4">Violation of any prohibition constitutes an immediate, material breach of these Terms entitling us to terminate your access without notice. Where legally required, we will report violations and all available metadata to law enforcement authorities.</p>
      </Section>

      <Section title="4A. Zero-Knowledge Architecture and Illegal Content — Critical Notice">
        <div className="mb-4 p-4 border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 rounded-xl">
          <p className="text-[11px] font-mono text-red-700 dark:text-red-400 leading-relaxed tracking-wide">
            THIS SECTION IS CRITICAL. READ IT IN FULL. YOUR USE OF THE SERVICE CONSTITUTES ACCEPTANCE OF EVERY PROVISION BELOW.
          </p>
        </div>

        <p className="mb-4">ScorchPad operates on a strict zero-knowledge architecture. We are technically and architecturally incapable of monitoring, reviewing, scanning, filtering, detecting, or accessing any content you share. The encrypted data stored on our servers is, from our perspective, indistinguishable from random noise. We do not possess decryption keys and cannot produce plaintext content under any circumstances.</p>

        <p className="mb-4 font-bold text-gray-700 dark:text-white/70">BECAUSE WE CANNOT ACCESS YOUR CONTENT, YOU AND YOU ALONE BEAR SOLE, EXCLUSIVE, TOTAL, AND UNLIMITED CRIMINAL, CIVIL, AND LEGAL LIABILITY FOR EVERY PIECE OF CONTENT YOU ENCRYPT AND SHARE THROUGH THE SERVICE. RSAAT LABS BEARS ZERO LIABILITY — LEGAL, CIVIL, CRIMINAL, OR OTHERWISE — FOR CONTENT IT TECHNICALLY CANNOT ACCESS.</p>

        <p className="mb-3">This specifically includes, without limitation:</p>
        <List items={[
          'Child sexual abuse material (CSAM) — a criminal offence under IPC Section 67B, POCSO Act, and laws worldwide. You face criminal prosecution, imprisonment, and fines. We bear zero liability.',
          'Terrorism-related content — criminal offences under UAPA, NIA Act, and equivalent laws globally. You face criminal prosecution. We bear zero liability.',
          'Child grooming, exploitation, or trafficking content — zero tolerance, criminal offences. We bear zero liability.',
          'Illegal weapon instructions, drug synthesis, or violence facilitation — criminal offences. We bear zero liability.',
          'Any other content that is criminal, tortious, or illegal under any applicable law.',
        ]} />

        <p className="mt-4">If we receive a credible, specific, actionable report identifying a particular paste ID as containing illegal content, we reserve the right to: (a) immediately delete the encrypted record from our servers; (b) report available metadata — paste ID, creation timestamp, hashed IP address — to appropriate law enforcement authorities. Deletion of the encrypted record does not constitute an admission that we accessed, verified, or were aware of its contents.</p>

        <p className="mt-4">We are not a law enforcement agency. We do not proactively monitor content. We are an encrypted storage intermediary with zero visibility into stored data. Rsaat Labs claims full intermediary liability protection under Section 79 of the Information Technology Act, 2000 (India) and equivalent safe harbour provisions in other jurisdictions.</p>
      </Section>

      <Section title="5. User Content — Absolute Sole Responsibility">
        <p>You are solely, exclusively, and entirely responsible for every piece of content you create, encrypt, and share using the Service. Your responsibility is absolute, unconditional, and unlimited. Specifically, you acknowledge and agree:</p>
        <List items={[
          'You are the sole author and owner of all content you share, or have all necessary rights to share it',
          'You bear full, sole, and unlimited legal, civil, and criminal liability for your content',
          'We have zero ability to review, filter, moderate, or remove encrypted content',
          'We have zero knowledge of and zero responsibility for your content',
          'We are a passive technical conduit — not a publisher, editor, or host of your content',
          'Our provision of the Service does not constitute endorsement of, participation in, or knowledge of your content',
          'You will not use the Service to violate the rights of any third party',
          'You indemnify us against every consequence of your use of the Service',
        ]} />
        <p className="mt-4">THE ZERO-KNOWLEDGE NATURE OF THE SERVICE MEANS YOUR CONTENT IS YOUR RESPONSIBILITY ALONE. FULL STOP. NO EXCEPTIONS. NO QUALIFICATIONS. NO SHARED LIABILITY WITH RSAAT LABS.</p>
      </Section>

      <Section title="6. Disclaimer of Warranties">
        <p className="mb-4">THE SERVICE IS PROVIDED "AS IS", "AS AVAILABLE", AND "WITH ALL FAULTS" WITHOUT ANY WARRANTY WHATSOEVER. TO THE ABSOLUTE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RSAAT LABS EXPRESSLY AND COMPLETELY DISCLAIMS:</p>
        <List items={[
          'All warranties of merchantability, fitness for a particular purpose, and non-infringement',
          'Any warranty that the Service will be uninterrupted, error-free, or available at any time',
          'Any warranty of security — encryption can be broken, systems can be compromised',
          'Any warranty that data will be preserved, backed up, or recoverable',
          'Any warranty that the Service is free of viruses, malware, or harmful components',
          'Any warranty that the Service meets your requirements or expectations',
          'Any implied or statutory warranty of any kind',
        ]} />
        <p className="mt-4">NO ADVICE, INFORMATION, OR STATEMENT — ORAL OR WRITTEN — OBTAINED FROM RSAAT LABS OR THROUGH THE SERVICE SHALL CREATE ANY WARRANTY NOT EXPRESSLY STATED IN THESE TERMS.</p>
      </Section>

      <Section title="7. Limitation of Liability — Absolute Zero">
        <div className="mb-4 p-4 border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 rounded-xl">
          <p className="text-[11px] font-mono text-red-700 dark:text-red-400 leading-relaxed tracking-wide">
            TO THE ABSOLUTE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RSAAT LABS, ITS OPERATOR, AND ANY AFFILIATED OR ASSOCIATED PERSONS SHALL HAVE ZERO LIABILITY OF ANY KIND — LEGAL, EQUITABLE, CONTRACTUAL, TORTIOUS, STATUTORY, CRIMINAL, CIVIL, OR OTHERWISE — ARISING OUT OF OR IN CONNECTION WITH THIS SERVICE, THESE TERMS, OR YOUR USE OR INABILITY TO USE THE SERVICE.
          </p>
        </div>

        <p className="mb-3">THIS ABSOLUTE ZERO LIABILITY INCLUDES, WITHOUT LIMITATION:</p>
        <List items={[
          'Loss of data, pastes, content, or access of any kind',
          'Loss of revenue, profits, business, customers, or goodwill',
          'Service interruptions, downtime, latency, or outages',
          'Unauthorized access to, interception of, or alteration of your data',
          'Failure of encryption or security measures',
          'Any conduct or content of any third party using the Service',
          'Any damages resulting from viruses, malware, exploits, or security vulnerabilities',
          'Any indirect, incidental, special, punitive, exemplary, or consequential damages of any nature',
          'Any claim related to illegal content created or shared by users',
          'Any government action, law enforcement action, or regulatory penalty',
          'Any claim by any third party arising from your use of the Service',
        ]} />

        <p className="mt-4">WHETHER OR NOT RSAAT LABS HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES, AND REGARDLESS OF THE THEORY OF LIABILITY, CAUSE OF ACTION, OR BASIS OF CLAIM.</p>

        <p className="mt-4">IF, DESPITE THE TOTALITY OF THE FOREGOING, ANY COURT OF COMPETENT JURISDICTION FINDS RSAAT LABS LIABLE FOR ANY MATTER WHATSOEVER, OUR TOTAL MAXIMUM CUMULATIVE AGGREGATE LIABILITY FOR ALL CLAIMS COMBINED SHALL NOT EXCEED ₹1 (ONE INDIAN RUPEE). THIS IS THE ABSOLUTE CEILING. NO EXCEPTIONS. NO NEGOTIATIONS. NO APPEALS TO EQUITY.</p>

        <p className="mt-4">BY USING THE SERVICE, YOU IRREVOCABLY AND PERMANENTLY WAIVE ANY AND ALL RIGHTS TO SEEK DAMAGES, COMPENSATION, RESTITUTION, OR ANY OTHER REMEDY FROM RSAAT LABS. YOUR SOLE AND EXCLUSIVE REMEDY FOR ANY DISSATISFACTION WITH THE SERVICE IS TO IMMEDIATELY STOP USING IT.</p>
      </Section>

      <Section title="8. Indemnification — Broad and Absolute">
        <p>You agree to fully, unconditionally, and permanently indemnify, defend (at your own expense), and hold harmless Rsaat Labs, its operator, and all affiliated persons from and against any and all:</p>
        <List items={[
          'Claims, suits, proceedings, investigations, and demands of any kind',
          'Liabilities, obligations, losses, penalties, fines, and damages of any kind',
          'Costs, expenses, and legal fees (including reasonable attorney fees)',
          'Government or regulatory actions, investigations, or proceedings',
          'Third-party claims arising from your content or use of the Service',
          'Claims arising from your violation of these Terms or any applicable law',
          'Claims arising from your violation of any third-party rights',
        ]} />
        <p className="mt-4">This indemnification obligation survives termination of your account and your cessation of use of the Service. It is unlimited in scope, amount, and duration.</p>
      </Section>

      <Section title="9. Zero-Knowledge Architecture and Law Enforcement">
        <p className="mb-4">ScorchPad is built on a zero-knowledge architecture. All encryption and decryption occurs exclusively client-side in your browser. We never possess, process, or store decryption keys. We are technically incapable of accessing the plaintext content of any paste. We bear absolutely no liability for the nature, legality, morality, or consequences of any content that passes through our systems in encrypted form.</p>

        <p className="mb-4 font-bold text-gray-700 dark:text-white/70">OUR POLICY ON GOVERNMENT AND LAW ENFORCEMENT REQUESTS:</p>
        <List items={[
          'We do not voluntarily cooperate with any government agency, law enforcement body, intelligence agency, or regulatory authority',
          'We do not respond to informal requests, police letters, administrative notices, verbal requests, or any communication that does not constitute valid legal process',
          'We do not respond to foreign government requests without a valid Mutual Legal Assistance Treaty (MLAT) process through Indian courts',
          'We only respond to valid orders issued by courts of competent jurisdiction in India, accompanied by proper legal process',
          'We actively challenge and contest orders that are overbroad, vague, disproportionate, legally deficient, or in violation of fundamental rights',
          'We notify affected users of legal requests before complying, unless a court explicitly prohibits such notification',
          'If we are legally prohibited from notifying users, our warrant canary will reflect this',
        ]} />

        <p className="mt-4 mb-3">In response to a valid, unchallenged, final court order we are legally compelled to comply with, we can only produce what we technically store:</p>
        <List items={[
          'Encrypted ciphertext — indistinguishable from random noise without the decryption key, which we do not possess',
          'Paste metadata: expiry timestamp, view count, syntax language tag, size in bytes — no content',
          'Creation timestamp',
          'HMAC-SHA256 hashed IP address — a one-way hash that cannot be reversed to recover the original IP',
          'Account information (email, name) only if the user created a registered account — anonymous pastes have zero linkage',
        ]} />

        <p className="mt-4">We cannot produce: plaintext content, decryption keys, URL fragments, raw IP addresses, or any data we do not possess. This is a technical impossibility, not a policy decision. No back door exists. None can be created on demand.</p>
      </Section>

      <Section title="10. No Class Actions — Individual Claims Only">
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, YOU WAIVE ALL RIGHTS TO BRING OR PARTICIPATE IN CLASS ACTION LAWSUITS, CLASS-WIDE ARBITRATIONS, PRIVATE ATTORNEY GENERAL ACTIONS, OR ANY OTHER CONSOLIDATED OR REPRESENTATIVE PROCEEDINGS AGAINST RSAAT LABS. ALL DISPUTES MUST BE BROUGHT IN YOUR INDIVIDUAL CAPACITY ONLY. YOU WAIVE ANY RIGHT TO A JURY TRIAL.
      </Section>

      <Section title="11. Force Majeure">
        Rsaat Labs shall have zero liability for any failure or delay in performance of any obligation under these Terms caused by circumstances beyond our reasonable control, including but not limited to: acts of God, natural disasters, war, terrorism, civil unrest, government actions, internet service provider failures, cloud provider outages, power failures, cyberattacks, or any other force majeure event.
      </Section>

      <Section title="12. Service Availability and Data Loss">
        We make absolutely no guarantee of uptime, availability, performance, or data persistence. Pastes are automatically deleted at expiry or upon reaching the maximum view count. Do not use ScorchPad as a backup, archive, or permanent storage solution. We are not liable under any circumstances for data loss resulting from paste expiry, TTL expiration, server failures, infrastructure outages, cyberattacks, or service discontinuation.
      </Section>

      <Section title="13. Account Termination">
        We reserve the absolute right to suspend, restrict, or permanently terminate your account and access to the Service at our sole and unfettered discretion, at any time, for any reason or no reason, without notice, explanation, or liability.
      </Section>

      <Section title="14. Severability">
        If any provision of these Terms is found to be invalid, unenforceable, or illegal under applicable law, such provision shall be modified to the minimum extent necessary to make it enforceable, and all remaining provisions shall continue in full force and effect.
      </Section>

      <Section title="15. Entire Agreement">
        These Terms, together with our Privacy Policy, constitute the entire agreement between you and Rsaat Labs regarding the Service and supersede all prior agreements, understandings, representations, and warranties — whether oral or written. No statement, promise, or representation by Rsaat Labs outside these Terms shall be binding.
      </Section>

      <Section title="16. Governing Law and Jurisdiction">
        These Terms shall be governed exclusively by the laws of the Republic of India, without regard to conflict of law principles. Any dispute, controversy, or claim arising out of or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the competent courts located in India. You irrevocably consent to this jurisdiction and waive any objection to venue.
      </Section>

      <Section title="17. Changes to Terms">
        We reserve the absolute right to modify, update, or replace these Terms at any time, at our sole discretion, without prior notice. Changes are effective immediately upon posting. Your continued use of the Service after any change constitutes your unconditional acceptance of the modified Terms.
      </Section>

      <Section title="18. Contact">
        For any questions regarding these Terms: <a href="mailto:rsaatlabs@gmail.com" className="text-indigo-600 dark:text-orange-400 underline hover:opacity-80">rsaatlabs@gmail.com</a>
      </Section>
    </div>
  );
}
