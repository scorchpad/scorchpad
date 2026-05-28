import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    // Required for `prose` / `prose-invert` classes used on the warrant canary page.
    require('@tailwindcss/typography'),
  ],
};

export default config;
