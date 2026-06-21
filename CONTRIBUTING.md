# Contributing to Finlo

Thank you for your interest in contributing. This guide covers setup, conventions, and the pull request process.

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Getting started

1. **Fork** [the repository](https://github.com/santhosh-patel/finlo-main) and clone your fork.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your own Supabase project (see [README.md](./README.md)).
4. Apply migrations from `supabase/migrations/` to your Supabase project.
5. Deploy Edge Functions from `supabase/functions/` and set required secrets in the Dashboard.
6. Run the dev server: `npm run dev`

You do not need a production Supabase project to work on UI-only changes, but most features require a configured backend.

## Development workflow

1. Create a branch from `main`: `git checkout -b feat/your-feature`
2. Make focused changes with clear commit messages.
3. Run quality checks before pushing (see below).
4. Open a pull request against `main` using the PR template.

## Before you submit a PR

Run the full check suite locally:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Fix any failures in the areas your change touches. CI runs the same checks on every pull request.

## Code guidelines

- Match existing patterns in the file you are editing (naming, imports, component structure).
- Keep changes focused — one logical change per PR when possible.
- Do not commit secrets, `.env` files, build artifacts (`dist/`, `dev-dist/`), or Supabase CLI temp state.
- Do not add hardcoded API keys, passwords, or project-specific URLs. Use environment variables or `app_secrets` (see `supabase/seed-app-secrets.example.sql`).
- Prefer small, readable diffs over large refactors unless discussed first.
- Add or update tests when fixing bugs or changing behavior.

## Project areas

| Path | Purpose |
|------|---------|
| `src/` | React app — pages, components, hooks, client logic |
| `supabase/migrations/` | Postgres schema, RLS policies, triggers |
| `supabase/functions/` | Deno Edge Functions (AI, admin, notifications) |
| `scripts/` | Local bootstrap tooling (admin seed, user push) |
| `android/` | Capacitor Android shell |

See [FEATURES.md](./FEATURES.md) for product scope and [README.md](./README.md) for architecture.

## Pull request process

1. Fill out the PR template completely — summary, test plan, checklist.
2. Link related issues (`Fixes #123`) when applicable.
3. Ensure CI checks pass.
4. Address review feedback promptly.
5. Maintainers may squash-merge or request changes before merge.

## Security

See [SECURITY.md](./SECURITY.md). **Never open a public issue for vulnerabilities** — report them privately.

## Questions

Open a [GitHub Discussion](https://github.com/santhosh-patel/finlo-main/discussions) or issue for bugs, feature ideas, or setup help. For architecture changes that affect multiple areas, open an issue first to align on approach.
