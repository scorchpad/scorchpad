<div align="center">

# 🔥 ScorchPad

**Zero-knowledge encrypted paste sharing.**  
The server never sees your content — not even a glimpse.

[![CI](https://github.com/scorchpad/scorchpad/actions/workflows/ci.yml/badge.svg)](https://github.com/scorchpad/scorchpad/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

[**Live →**](https://scorchpad.rsaatlabs.com) · [Pricing](https://scorchpad.rsaatlabs.com/pricing) · [Security](https://scorchpad.rsaatlabs.com/security) · [Warrant Canary](https://scorchpad.rsaatlabs.com/warrant-canary)

</div>

---

## What is ScorchPad?

ScorchPad is an encrypted, ephemeral paste tool for sharing passwords, API keys, and sensitive text. Encryption and decryption happen entirely in your browser using the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). The decryption key lives in the URL fragment (`#...`) — which is never sent to the server by the browser.

**The server stores only ciphertext. It cannot decrypt it.**

---

## How the encryption works

```
Your text
    │
    ▼
AES-256-GCM (WebCrypto)  ←  random 256-bit key
    │                              │
    ▼                              ▼
ciphertext  ──── stored in Redis   key ──── lives in URL fragment only
    │
    ▼
https://scorchpad.rsaatlabs.com/p/<id>#<base64url-key>
                                        ↑
                          never reaches the server
```

1. A random 256-bit AES-GCM key is generated client-side.
2. Your content is encrypted in the browser before anything leaves your device.
3. Only the ciphertext is sent to and stored on the server (in Upstash Redis with a TTL).
4. The key is appended as a URL fragment, which browsers never include in HTTP requests.
5. When a recipient opens the link, their browser decrypts the ciphertext locally.

The server has no key, no plaintext, and no ability to read your pastes — by design.

---

## Features

- **End-to-end encryption** — AES-256-GCM via the Web Crypto API
- **Zero-knowledge servers** — ciphertext only, keys never leave the browser
- **Burn after reading** — auto-delete after 1 view
- **Custom expiry** — 5 minutes to 30 days
- **View limits** — cap how many times a paste can be opened
- **Password protection** — optional second layer of protection
- **Syntax highlighting** — TypeScript, Python, Rust, Go, SQL, and more
- **Anonymous or authenticated** — use without an account, or sign in for more control
- **Rate limiting** — per-IP and per-user via Upstash
- **Warrant canary** — PGP-signed, updated every 45 days
- **Content Security Policy** — nonce-based CSP, no `unsafe-inline`
- **IP privacy** — raw IPs are never stored; only a one-way HMAC-SHA256 hash for rate limiting

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router, React 19) |
| Language | TypeScript 5.4 (strict) |
| Auth | [Clerk](https://clerk.com/) |
| Database | [Supabase](https://supabase.com/) (Postgres via Prisma 7) |
| Paste storage | [Upstash Redis](https://upstash.com/) (encrypted blobs + TTL) |
| Rate limiting | [Upstash Ratelimit](https://github.com/upstash/ratelimit) |
| Payments — India | [Razorpay](https://razorpay.com/) |
| Payments — Global | [Lemon Squeezy](https://www.lemonsqueezy.com/) |
| Email | [Resend](https://resend.com/) |
| Error tracking | [Sentry](https://sentry.io/) |
| Styling | Tailwind CSS |
| Syntax highlighting | highlight.js |
| Testing | Vitest + Playwright |
| Hosting | [Vercel](https://vercel.com/) |

---

## Running locally

### Prerequisites

- Node.js ≥ 22
- A [Supabase](https://supabase.com/) project (Postgres)
- An [Upstash](https://upstash.com/) Redis database
- A [Clerk](https://clerk.com/) application
- A [Sentry](https://sentry.io/) project (optional for local dev)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/scorchpad/scorchpad.git
cd scorchpad

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in your values — see Environment variables below

# 4. Push the database schema
npx prisma migrate deploy

# 5. Start the dev server
npm run dev
```

The app will be running at `http://localhost:3000`.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in each value. Here's where to find them:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard → Webhooks → your endpoint |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (pooled) |
| `DIRECT_URL` | Supabase → Settings → Database → Connection string (direct) |
| `UPSTASH_REDIS_REST_URL` | Upstash Dashboard → your database → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Dashboard → your database → REST API |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Settings → Projects → Client Keys |
| `RESEND_API_KEY` | Resend Dashboard → API Keys |
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy → Settings → API |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Settings → API Keys |
| `IP_HASH_SECRET` | Generate: `openssl rand -hex 32` |

---

## Webhook setup

ScorchPad uses webhooks from three providers. Configure endpoints in each dashboard to point to your deployed URL:

| Provider | Endpoint |
|---|---|
| Clerk | `https://your-domain/api/webhooks/clerk` |
| Lemon Squeezy | `https://your-domain/api/webhooks/lemonsqueezy` |
| Razorpay | `https://your-domain/api/webhooks/razorpay` |

---

## Database migrations

```bash
# Apply migrations to your database
npx prisma migrate deploy

# Generate the Prisma client (runs automatically on npm install)
npx prisma generate

# Open Prisma Studio (local database browser)
npx prisma studio
```

---

## Testing

```bash
# Unit tests
npm test

# Unit tests in watch mode
npm run test:watch

# End-to-end tests (requires a running dev server)
npm run test:e2e
```

---

## Project structure

```
scorchpad/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── paste/          # Paste create / fetch / password verify
│   │   ├── checkout/       # Payment checkout (Razorpay + Lemon Squeezy)
│   │   ├── webhooks/       # Clerk, Lemon Squeezy, Razorpay
│   │   └── user/           # Account, subscription, action checks
│   ├── p/[id]/             # Paste viewer page
│   ├── pricing/
│   ├── about/
│   ├── security/
│   └── warrant-canary/
├── src/
│   ├── components/         # React components
│   ├── hooks/              # usePasteCreator, usePasteViewer, useSubscription
│   ├── lib/
│   │   ├── crypto.ts       # WebCrypto AES-256-GCM — the core of zero-knowledge
│   │   ├── sanitize.ts     # DOMPurify sanitization
│   │   └── urlFragment.ts  # Key encoding / decoding in URL fragments
│   └── store/              # Zustand paste state
├── lib/
│   ├── db.ts               # Prisma client (Postgres)
│   ├── redis.ts            # Upstash Redis client
│   ├── ratelimit.ts        # Rate limiting rules
│   ├── ip.ts               # IP hashing (HMAC-SHA256, raw IP never stored)
│   └── plan-limits.ts      # Free vs paid tier limits
├── prisma/
│   ├── schema.prisma       # User, Subscription, PasteLog, WebhookEvent
│   └── migrations/
├── public/
│   ├── pgp-key.txt         # Public PGP key for warrant canary verification
│   └── warrant-canary.txt  # PGP-signed warrant canary
└── middleware.ts           # Clerk auth + nonce-based CSP headers
```

---

## Security

### Encryption

Paste content is encrypted with AES-256-GCM using the browser's native [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto). The encryption key is generated randomly for each paste and placed only in the URL fragment. Fragments are not sent in HTTP requests — the server never receives the key.

### IP privacy

Raw IP addresses are never stored. For rate limiting purposes, IPs are hashed with HMAC-SHA256 using a secret key unique to this deployment (`IP_HASH_SECRET`). The hash is a one-way function — it cannot be reversed to recover the original IP.

### Content Security Policy

Every response includes a nonce-based CSP generated per request in `middleware.ts`. There is no `unsafe-inline` for scripts. Sentry events are tunnelled through `/monitoring` (same-origin) so no third-party ingest URLs appear in the CSP.

### Warrant canary

ScorchPad maintains a [warrant canary](https://scorchpad.rsaatlabs.com/warrant-canary) updated every 45 days, signed with our PGP key. The public key is available at `/pgp-key.txt`.

For a full security overview, see [scorchpad.rsaatlabs.com/security](https://scorchpad.rsaatlabs.com/security).

---

## Deploying to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/scorchpad/scorchpad)

Add all environment variables from `.env.example` to your Vercel project settings before deploying. Then run the database migration once:

```bash
npx prisma migrate deploy
```

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for significant changes. For security issues, please use responsible disclosure — see [scorchpad.rsaatlabs.com/security](https://scorchpad.rsaatlabs.com/security) for contact details.

---

## Built by

[Rsaat Labs](https://rsaatlabs.com) · [scorchpad.rsaatlabs.com](https://scorchpad.rsaatlabs.com)
