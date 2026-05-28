import { PasteEditor } from '../src/components/paste/PasteEditor';
import { TrustBadges } from '../src/components/ui/TrustBadges';

export default function Home() {
  return (
    <div className="flex flex-col items-center pt-16 pb-24">
      <div className="text-center max-w-2xl mx-auto mb-10 px-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tighter mb-4 text-gray-900 dark:text-white">Zero-knowledge encrypted sharing</h1>
        <p className="text-lg text-gray-600 dark:text-white/50 font-medium tracking-wide">Securely share passwords, API keys, and confidential data. The server never sees your content.</p>
      </div>
      <PasteEditor />
      <div className="mt-8">
        <TrustBadges />
      </div>
    </div>
  );
}
