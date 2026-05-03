
# Finlo — full overhaul plan

> Heads up: I don't see a logo image attached to this message. Please drag-drop the logo (PNG/SVG) into the chat before approving, or I'll ship a temporary text mark and swap it in next round.

## 1. Rename to "Finlo"
- `index.html`: title → `Finlo — Personal Expense Tracker`, meta description, og tags.
- Header in `Index.tsx`: "Ledger" → "Finlo".
- `Login.tsx`, `Settings.tsx` headings updated.
- Add favicon + apple-touch-icon from the uploaded logo (placed in `public/finlo-logo.png` + `.svg` if vector).

## 2. Real auth on Lovable Cloud (replaces localStorage credentials)
The current "auth" is a hardcoded string check in localStorage — it can't support admin-managed users or cross-device sync. Migrating to Cloud auth is the foundation for items 3, 5, and 8.

**Database (migration):**
- `app_role` enum: `admin`, `user`.
- `profiles` table: `id` (PK), `user_id` (FK auth.users, unique), `display_name`, `email`, timestamps. RLS: users read/update own; admins read/update all.
- `user_roles` table: `id`, `user_id`, `role`. RLS via `has_role()` security-definer function (no recursion).
- `handle_new_user()` trigger on `auth.users` insert → creates profile row + default `user` role.
- Seed admin: after migration runs, I'll insert `santhoshpatel002@gmail.com` via the auth admin API and assign `admin` role. Password `Chinni@2003`.
- Email confirmation **off** so admin-created users can sign in immediately.

**Frontend:**
- Replace `useAuth.ts` with Supabase session-based hook (`onAuthStateChange` set up before `getSession`).
- `Login.tsx` uses `supabase.auth.signInWithPassword`.
- New `/admin` route guarded by `has_role(admin)`:
  - List users (from `profiles` + role join)
  - "Add user" form: name, email, password → calls an edge function `admin-create-user` (uses service role key) that creates the auth user, profile, and `user` role.
  - Per-row actions: reset password, change name, delete user, toggle admin role.
- Non-admins never see admin route; route returns 404-style screen.

## 3. Cloud-synced expenses + Sync button
**Database (migration):**
- `expenses` table: `id`, `user_id`, `amount`, `category`, `subcategory`, `note`, `date`, `payment_method`, `created_at`, `updated_at`. RLS: own rows only; admins read all.
- `categories` table (per-user overrides): `id`, `user_id`, `name`, `subcategories text[]`, `color`, `icon`. RLS own.
- `budgets` table: `id`, `user_id`, `category`, `amount_monthly`. RLS own.

**Frontend:**
- Refactor `useExpenses.ts` to load/save from Supabase when authed; keeps a `localStorage` mirror for offline use (PWA, item 9).
- Optimistic writes: update local state immediately, queue mutation, retry on reconnect.
- Settings → **Data** tab gets:
  - **Sync now** button: pushes any local-only rows (offline edits) and pulls latest from server. Shows last-synced timestamp.
  - Auto-sync on auth, on network reconnect, and via Realtime subscription so a change on device A appears on device B without a manual click.

## 4. JSON backup + restore
- In Settings → Data:
  - **Export JSON**: bundles expenses, categories, budgets, profile name, theme settings → downloads `finlo-backup-{username}-{YYYY-MM-DD}.json`.
  - **Import JSON**: file picker → preview (counts, version check) → "Replace" or "Merge" choice → writes to local + cloud.
- Schema versioned with `{ version: 1, exported_at, ... }` for forward compatibility.

## 5. Date-ranged CSV export with smart filename
- `SearchOverlay` export already exists; extend to:
  - Inline date-range picker (defaults to current filter range).
  - Filename pattern: `{username}-{from}_to_{to}.csv` (e.g. `santhosh-2026-04-01_to_2026-04-30.csv`); single-day → `{username}-{YYYY-MM-DD}.csv`; whole month → `{username}-{YYYY-MM}.csv`.
  - Same picker reused for JSON export.

## 6. Stacked category bars in Weekly view
Replace single-color bars in `WeeklyView.tsx` with vertical stacked bars where each segment = a category, colored by `CategoryDef.color`.
- Compute per-day per-category totals.
- Render segments bottom-up; tap any segment to filter the day list to that category, tap bar background to expand the day.
- Legend chips above bars (top 5 categories of the week + "Other").
- Same treatment optionally added to MonthlyView's overview bar (will confirm during build if it fits).

## 7. Refined dark theme + motion guidelines
- New dark palette in `index.css` (HSL):
  - `--background 220 14% 7%` (near-black, slight cool)
  - `--surface 220 12% 11%`
  - `--foreground 40 8% 94%`
  - `--ink-muted 220 6% 60%`
  - `--border 220 10% 16%`
  - `--accent` driven by user's chosen accent (already in `useTheme`), with paired `--accent-foreground` auto-computed for contrast.
  - Soft elevation via `--shadow-sm: 0 1px 0 hsl(220 30% 2% / 0.6)` instead of harsh borders.
- Curated accent palette (8 swatches) with proper light + dark variants instead of one hex per accent.
- Global transitions: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`; standard durations (120ms / 200ms / 320ms) applied to buttons, sheets, collapsibles. Add `prefers-reduced-motion` guard.
- Light theme also re-tuned for contrast parity (text on surface AA-compliant in both modes).
- Update `tailwind.config.ts` to expose new tokens.

## 8. PWA with offline expense entry
- Add web manifest (`/public/manifest.webmanifest`) with Finlo name, icons (from logo), `display: standalone`, theme color matching dark/light.
- Add `vite-plugin-pwa` with strict guards per Lovable rules:
  - `devOptions.enabled: false`
  - Registration skipped when inside iframe or on `*.lovableproject.com` / `id-preview--*`
  - `NetworkFirst` for HTML, `StaleWhileRevalidate` for assets, `navigateFallbackDenylist` for `/~oauth`.
- Offline write queue: expense mutations stored in `localStorage` (already there) + a `pending_sync` array; flushed when navigator reports online (item 3 sync handles upload).
- Warn user PWA only works in published build, not preview.

## 9. Other improvements I'd bundle in (high-leverage, low-risk)
- **Header polish**: replace cluttered top bar with a compact app bar — logo + tabs as bottom nav on mobile; settings/search as icon buttons.
- **Empty-state illustrations** for Today/Week/Month and Search.
- **Toast feedback** on every mutation (sonner is already wired).
- **Keyboard shortcuts**: `n` add, `/` search, `g t/w/m` switch view.
- **Recurring expenses** model (table + nightly edge function via pg_cron) — flagged but ask before building.
- **Currency setting** in Settings (₹ default).
- **Security memory** updated to reflect new RLS posture.

## Technical notes
- Migration order: enums → tables → RLS → trigger → seed admin via insert tool after table creation.
- Edge functions:
  - `admin-create-user` (verify caller is admin, use service-role client to create auth user, profile, role).
  - Optionally `seed-admin` one-shot (or done via insert tool).
- All client mutations go through Supabase; localStorage acts purely as offline cache + PWA queue.
- Files touched: `src/hooks/useAuth.ts`, `src/hooks/useExpenses.ts`, `src/hooks/useTheme.ts`, `src/pages/{Login,Index,Settings}.tsx`, new `src/pages/Admin.tsx`, `src/components/{WeeklyView,SearchOverlay,ImportSheet}.tsx`, `src/components/DataSettings.tsx` (new), `src/index.css`, `tailwind.config.ts`, `index.html`, `vite.config.ts`, `public/manifest.webmanifest`, `supabase/functions/admin-create-user/index.ts`.

## Open question
Should I scope this to one mega-pass, or split into two?
- **Pass A (foundation)**: items 1, 2, 3, 7 (rename + cloud auth + sync + dark theme).
- **Pass B (polish + features)**: items 4, 5, 6, 8, 9.

Splitting keeps each pass reviewable. Default if you don't pick: ship all in one pass.
