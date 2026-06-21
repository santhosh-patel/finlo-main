# Contributing to Finlo

Thank you for your interest in contributing. This guide covers setup, conventions, and the pull request process.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your own Supabase project (see [README.md](./README.md)).
4. Apply migrations from `supabase/migrations/` to your Supabase project.
5. Deploy Edge Functions from `supabase/functions/` and set required secrets in the Dashboard.
6. Run the dev server: `npm run dev`

## Before you submit a PR

Run the quality checks locally:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Fix any failures in the areas your change touches.

## Code guidelines

- Match existing patterns in the file you are editing (naming, imports, component structure).
- Keep changes focused — one logical change per PR when possible.
- Do not commit secrets, `.env` files, build artifacts (`dist/`, `dev-dist/`), or Supabase CLI temp state.
- Do not add hardcoded API keys, passwords, or project-specific URLs. Use environment variables or `app_secrets` (see `supabase/seed-app-secrets.example.sql`).
- Prefer small, readable diffs over large refactors unless discussed first.

## Pull request process

1. Create a branch from `main` with a descriptive name (e.g. `fix/budget-rounding`, `feat/export-csv`).
2. Write a clear PR description: what changed, why, and how to test it.
3. Link related issues if applicable.
4. Ensure CI checks pass (when configured).
5. Address review feedback promptly.

## Security

See [SECURITY.md](./SECURITY.md). **Never open a public issue for vulnerabilities** — report them privately.

## Questions

Open a GitHub Discussion or issue for bugs, feature ideas, or setup help. For architecture changes that affect multiple areas, consider opening an issue first to align on approach.
