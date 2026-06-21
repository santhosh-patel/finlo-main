# Security Policy

## Reporting a vulnerability

If you discover a security issue, **please do not open a public GitHub issue**.

Instead, report it privately to the maintainers (use GitHub Security Advisories if enabled, or contact the repository owner directly). Include:

- A description of the issue and potential impact
- Steps to reproduce
- Affected files, endpoints, or versions (if known)

We will acknowledge reports as quickly as we can and work on a fix before public disclosure when appropriate.

## Secrets and credentials

This project is designed so that **no secrets belong in git**.

| Location | What belongs there |
|----------|-------------------|
| `.env` (gitignored) | Local dev: `VITE_SUPABASE_*`, optional `SEED_BOOTSTRAP_SECRET` |
| Supabase Dashboard → Edge Functions → Secrets | `GEMINI_API_KEY`, `GROQ_API_KEY`, `VAPID_*`, `CRON_SECRET`, `SEED_ADMINS`, etc. |
| `public.app_secrets` (Postgres) | `service_role_key`, `supabase_functions_url` — see `supabase/seed-app-secrets.example.sql` |

**Never commit:**

- `.env` or `.env.local`
- Service role keys, model API keys, or VAPID private keys
- Passwords, bootstrap secrets, or keystore files
- Supabase CLI `.temp/` state (linked project refs, pooler URLs)

Use `.env.example` as a template only. Copy it to `.env` and fill in your own values locally.

## Client vs server keys

- **`VITE_*` variables** are bundled into the browser. Only put **publishable (anon) keys** and **VAPID public keys** there.
- **Service role keys and model API keys** must stay on the server (Edge Function secrets or gitignored local scripts).

## If secrets were exposed

If credentials were ever committed or pushed:

1. **Rotate immediately** in Supabase Dashboard (anon key, service role key, JWT secret if needed).
2. Rotate third-party keys (Gemini, Groq, VAPID, etc.).
3. Change any seeded admin passwords.
4. Remove secrets from git history (e.g. `git filter-repo` or BFG) if the repository was public.
5. Review Supabase audit logs for unauthorized access.

Treat any secret that appeared in git as compromised, even after removal from the latest commit.

## Secure development

- Run `npm run lint`, `npm run typecheck`, and `npm test` before opening PRs.
- Do not paste real keys in issues, PR descriptions, or chat logs.
- Prefer Supabase Edge Function secrets over hardcoded fallbacks in code.
