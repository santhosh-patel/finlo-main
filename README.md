# Finlo

Finlo is a personal expense tracker with a mobile-first web app (installable PWA). It helps you log spending and income, organize categories, set budgets, and understand patterns—with optional AI assistance for natural-language entry, receipt parsing, and conversational insights.

## Features

- **Ledger** — Today / week / month views, quick add, detailed expense editing, search, and filters.
- **Categories & budgets** — Custom categories, subcategories, and per-category budgets.
- **Loans & recurring** — Track loans and recurring expenses.
- **Data** — CSV import/export, trash / restore, sync with Supabase; offline-friendly pending queue for writes when connectivity is poor.
- **Maya (AI)** — Chat assistant for spending questions and structured “add to Finlo” suggestions; rate-limited Edge Function backend.
- **Smart entry** — Natural-language expense parsing and receipt scanning (Edge Functions + external model APIs where configured).
- **Accounts** — Email/password auth, user profile, optional admin area for managed deployments.

## Tech stack
 
| Area | Choice |
|------|--------|
| UI | React 18, TypeScript, Vite 5, Tailwind CSS, shadcn/ui (Radix), Recharts |
| Data & auth | Supabase (Postgres, Auth, Realtime) |
| Edge | Supabase Edge Functions (Deno) |
| PWA | `vite-plugin-pwa`, Workbox |

## Prerequisites


- **Node.js** 18+ (20+ recommended)
- **npm** (or compatible client)
- A **Supabase** project with this app’s schema, RLS policies, and Edge Functions deployed (see `supabase/migrations/` and `supabase/functions/`).

## Local development

1. **Clone and install**

   ```bash
   git clone <your-repo-url> finlo
   cd finlo
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set the `VITE_SUPABASE_*` variables for your project. Only use the **publishable (anon) key** in `VITE_*` variables; never put service-role or model API keys in client env vars.

3. **Run the app**

   ```bash
   npm run dev
   ```

   The dev server defaults to port **8080** (see `vite.config.ts`).

4. **Quality checks**

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

## Supabase

- **Migrations** live in `supabase/migrations/`. Apply them to your project with the Supabase CLI or Dashboard SQL.
- **Edge Functions** live in `supabase/functions/`, including:
  - `ask-data` — Maya chat (typically Gemini and/or Groq; secrets required)
  - `nl-parse-expense`, `parse-receipt`, `suggest-category` — AI-assisted entry
  - `spending-insights`, `process-recurring` — insights / automation
  - `seed-admin`, `admin-*` — bootstrap and admin APIs where enabled

Set function secrets in the Supabase Dashboard (for example `GEMINI_API_KEY`, `GROQ_API_KEY`, `ALLOWED_ORIGINS`, and any keys referenced in each function). See `.env.example` for notes on admin seeding and `SEED_BOOTSTRAP_SECRET`.

## Production build & PWA

```bash
npm run build
npm run preview   # optional local preview of dist/
```

In production, the service worker is registered from `src/main.tsx` when appropriate; the web app manifest is generated alongside the build.

## Project layout (high level)

- `src/` — React app (pages, components, hooks, Supabase client, expense logic)
- `supabase/` — migrations, Edge Functions, shared Deno helpers
- `public/` — static assets and PWA icons
- `scripts/` — tooling such as admin bootstrap

## License


This repository is **private** (`"private": true` in `package.json`). Add a `LICENSE` file if you intend to distribute the code.
