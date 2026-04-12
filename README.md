# qlessmart

Smart checkout and store-session web app built with React + Vite + Firebase + Vercel serverless APIs.

## Quick Navigation

- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Environment Variables](#environment-variables)
- [Security Notes](#security-notes)
- [Tech Stack](#tech-stack)

## Getting Started

```bash
git clone <YOUR_GIT_URL>
cd qlessmart
npm ci
npm run dev
```

Open: `http://localhost:5173`

<details>
<summary><strong>First-time setup checklist</strong></summary>

- [ ] Install Node.js 18+ and npm
- [ ] Add required `.env` variables (see [Environment Variables](#environment-variables))
- [ ] Run `npm ci`
- [ ] Run `npm run dev`
- [ ] Run `npm run build`
- [ ] Run `npm run test` (currently a minimal smoke test)

</details>

## Scripts

```bash
npm run dev        # Start local dev server
npm run build      # Production build
npm run preview    # Preview built app
npm run test       # Run tests (Vitest)
npm run lint       # Lint codebase (ESLint)
```

Current test suite: a basic Vitest smoke test in `/src/test` to validate the test runner setup.

## Environment Variables

Create a `.env` file in the project root.

<details>
<summary><strong>Client (Vite) variables</strong></summary>

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

</details>

<details>
<summary><strong>Server/API variables (Vercel functions)</strong></summary>

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RESEND_API_KEY`

</details>

## Security Notes

- A repository scan was performed for exposed secrets/patterns.
- No hardcoded API keys/private secrets were found in tracked source files.
- Secrets are expected via environment variables (`.env*` is already gitignored).
- Never commit real credentials into code, screenshots, or docs.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Firebase (Auth + Firestore)
- Vercel serverless API routes
- Vitest + ESLint
