# Finlo — full improvement roadmap

Shipping all 45 items end-to-end. Sequenced into 6 phases so each phase is independently shippable, reviewable, and unblocks the next. Total ~6 phases; you can approve all at once or pause between phases.

---

## Phase 1 — Money model fixes (foundation)

These change the data shape, so they go first. Everything else builds on them.

**1.1 Income & net balance**

- Migration: add `type text not null default 'expense' check (type in ('expense','income'))` to `expenses`. Rename UX as "Transactions". Index `(user_id, date desc, type)`.
- `AddExpenseSheet`: add Income/Expense toggle at top. Income hides category-budget logic, uses a smaller `income_categories` set (Salary, Freelance, Refund, Other).
- New aggregates: `totalIn`, `totalOut`, `net` shown on Summary header. Monthly/Weekly views show two stacked totals.

**1.2 Multi-currency per transaction**

- Migration: add `currency text not null default 'INR'`, `fx_rate numeric` (rate to base at time of entry), `base_amount numeric` (computed on insert via trigger).
- New table `fx_rates(date, base, quote, rate)`; nightly edge function `fetch-fx-rates` (free tier from exchangerate.host) populates it.
- AddExpenseSheet: currency dropdown next to amount; auto-fills today's rate, editable.
- All charts & totals use `base_amount`.

**1.3 Tags + reimbursable + split**

- New tables: `tags(id, user_id, name, color)`, `expense_tags(expense_id, tag_id)`, `expense_splits(id, parent_expense_id, category, amount, note)`.
- Add `is_reimbursable boolean default false`, `reimbursed_at timestamptz` to `expenses`.
- Drawer gets Tags chip-input, Reimbursable toggle, "Split this" action.
- New `/reimbursable` filter chip on Search.

**1.4 Dedicated lending tracker**

- Migration: `loans(id, user_id, counterparty, amount, direction (lent|borrowed), date, due_date, status, expense_id)`.
- New `LoansSheet` from Settings. "Lending" category auto-creates a loan row.
- Summary widget: "Owed to me / I owe".

---

## Phase 2 — Sync, offline, conflict (reliability)

**2.1 Realtime**

- `alter publication supabase_realtime add table expenses, recurring_expenses, budgets, categories;`
- `useExpenses`: subscribe to `postgres_changes` filtered by `user_id`, merge into local state.

**2.2 Offline write queue + conflict resolution**

- Add `client_updated_at timestamptz` to `expenses` (client clock).
- `useExpenses` writes to IndexedDB queue (via `idb` library) when offline; flushes on `online` event.
- Server-side: trigger rejects update if incoming `client_updated_at < existing.updated_at` → returns 409 → UI shows "Conflict, keep mine / theirs" toast.

**2.3 Soft delete + 30-day trash + edit history**

- Add `deleted_at timestamptz` to `expenses`; RLS `select` filters `deleted_at is null` for normal queries; new `/trash` page lists deleted.
- New `expense_history(id, expense_id, snapshot jsonb, changed_at, changed_by)`; trigger on `expenses` UPDATE/DELETE writes a row. Drawer gets "History" tab.
- Daily edge function `purge-trash` deletes rows where `deleted_at < now() - 30 days`.

**2.4 Import dedupe & idempotency**

- Compute `hash = md5(date||amount||category||note)`; add `import_hash` column with unique partial index per user. Import skips duplicates, shows summary.

---

## Phase 3 — Core UX upgrades

**3.1 Receipt capture + AI auto-fill** (highest-leverage UX win)

- Storage bucket `receipts` (private, RLS: own only).
- AddExpenseSheet: camera/upload button → uploads to bucket → calls edge function `parse-receipt`.
- `parse-receipt`: sends image to `google/gemini-2.5-flash` with structured-output prompt → returns `{amount, merchant, date, category_guess, items[]}` → form pre-fills.
- `expenses.receipt_url` column added.

**3.2 Smart category suggestion**

- `suggest-category` edge function: keyword map first (uber→Travel/cab, swiggy→Food/delivery, …), Gemini Flash fallback if confidence low. Cached per `(user_id, normalized_note)` in a `category_suggestions` table.
- AddExpenseSheet calls on note blur.

**3.3 Natural-language add + ask-your-data**

- New `QuickAddBar` with text input ("450 dinner with kavya yesterday") → edge function `nl-parse-expense` (Gemini Flash, structured output) → preview → confirm.
- `AskBar` on Summary: NL → SQL via Gemini Pro with whitelisted columns + user_id injected server-side → run `read_query`-style RPC → render answer + chart.

**3.4 Anomaly detection + forecast**

- Edge function `monthly-insights-v2` (replaces `spending-insights`):
  - Computes per-category mean+stddev over trailing 6 months.
  - Flags current-month txns >2σ.
  - Linear projection of end-of-month spend per category.
- Cached per `(user_id, month)` in `insight_cache` table, 24h TTL.
- MonthlyView renders "⚠ Unusual" badges + projection bars.

**3.5 Quick-add FAB + keyboard shortcuts**

- Floating + button on mobile (always reachable), `n` to add, `/` to search, `g t/w/m` to switch tab. Shortcut help modal on `?`.

**3.6 Calendar heatmap + month-over-month compare**

- New `MonthHeatmap` (GitHub-style 5-shade) on Monthly view.
- "Compare" toggle: shows last month deltas inline next to each category row (`+12%` red, `-8%` green).

---

## Phase 4 — Admin v2

**4.1 Dashboard metrics**

- New `/admin` tab "Overview": total users, DAU/WAU (computed from `expenses.created_at` grouped), total txns, top platform categories, signups sparkline. Edge function `admin-metrics` aggregates server-side.

**4.2 View-as user (impersonate, read-only)**

- Admin clicks user → opens `/?as=<user_id>` route. `useExpenses` reads `as` param when caller `isAdmin`; mutations disabled (banner: "Viewing as &nbsp;. Read-only.").

**4.3 Bulk actions + invite flow + audit log viewer**

- User list: checkbox column → bulk delete, bulk role change, export CSV.
- "Invite by email" button → `admin-invite-user` edge function calls `inviteUserByEmail`.
- New "Audit log" tab queries `admin_audit_log` with filters (actor, action, date).

---

## Phase 5 — Notifications & alerts

**5.1 In-app notification center**

- Migration: `notifications(id, user_id, kind, title, body, link, read_at, created_at)` + RLS own.
- Bell icon in header with unread badge; sheet lists items.
- Triggers: budget threshold, recurring bill created, anomaly detected, conflict.
- Replace toast-only `useBudgetAlerts` to also insert a notification row.
  &nbsp;

**5.2 Recurring polish**

- Add `auto_generated boolean` flag to `expenses` + recurring badge in `ExpenseRow`.
- "Upcoming bills (next 14d)" widget on Summary.
- Drawer: "Manage rule" link if `auto_generated`.
- Carry-forward / rollover budgets: `budgets.rollover boolean`; carry unspent into next month.

---

## Phase 6 — Security, performance, polish

**6.1 Security**

- Enable Leaked Password Protection (HIBP) via `configure_auth`.
- Re-auth modal before password change / account delete / role change (re-enter password → `signInWithPassword` to verify).
- 2FA (TOTP) — Settings → Security: enroll, list factors, unenroll.
- Active sessions list + revoke (uses `auth.admin.listSessions` via edge function gated to self).
- Self-serve account deletion: edge function `delete-account` cascades expenses/loans/etc, then `auth.admin.deleteUser`.

**6.2 Performance**

- Add indexes: `expenses (user_id, date desc)`, `(user_id, category, date)`, partial `where deleted_at is null`.
- Server-side aggregates: SQL views `v_monthly_by_category`, `v_weekly_by_day_category`; views read via RPC; clients stop pulling raw rows for charts.
- Virtualize long transaction lists with `react-window`.
- Cache `monthly-insights-v2` results (covered in 3.4).

**6.3 Polish**

- Light-mode contrast pass (audit each surface w/ token swap).
- Skeleton loaders on Index/Summary.
- Pull-to-refresh on mobile list (`react-pull-to-refresh` or custom).
- Haptics on add/delete (`navigator.vibrate(10)`).
- Print-friendly PDF monthly statement: edge function `monthly-statement-pdf` (uses `pdf-lib` in Deno) → downloads.
- i18n scaffold with `react-i18next`; ship English + Hindi + Telugu strings for the top-level UI.
- PWA share-target: `manifest.webmanifest` `share_target` action → opens AddExpense pre-filled with shared text → NL parser.
- Empty-state illustrations + 3-step onboarding wizard (categories → first budget → first txn) + "load sample data" toggle.

---

## Cross-cutting technical notes

- **Migrations** added in order; each phase = one migration file + matching code.
- **Edge functions added**: `fetch-fx-rates`, `parse-receipt`, `suggest-category`, `nl-parse-expense`, `ask-data`, `monthly-insights-v2`, `admin-metrics`, `admin-invite-user`, `weekly-digest`, `purge-trash`, `delete-account`, `monthly-statement-pdf`.
- **Cron jobs** (via `pg_cron` insert tool, not migration): fx daily 02:00 UTC, purge-trash daily 03:00, weekly-digest Mon 08:00 UTC (per-tz handled in function).
- **New secrets to request**: `RESEND_API_KEY` (email), `EXCHANGERATE_API_KEY` (optional — exchangerate.host has free tier without key first).
- **Lovable AI** covers all LLM needs; no extra keys.
- **Files touched**: most of `src/components/*`, `src/hooks/useExpenses.ts`, `src/pages/{Index,Admin,Settings}.tsx`, plus ~20 new components/edge functions.

---

## Suggested execution

- **Phase 1 (foundation)** must ship first — everything depends on `type`, `currency`, `base_amount`.
- **Phases 2 & 3 in parallel-ish** — sync work and UX work touch different files.
- **Phase 4 (admin)** any time after Phase 1.
- **Phases 5 & 6** last (depend on notification center existing & data shape stable).

If you want to keep PRs reviewable I'd ship one phase per turn. If you want it all in one go, approve and I'll execute end-to-end, deploying functions and migrations as I go.

## Open questions before I start

1. Base currency — default INR (₹), confirm?
2. Email provider — OK to use Resend (you'll add `RESEND_API_KEY`), or skip email digest for now?
3. Phase ordering — ship phase-by-phase (recommended) or one mega pass?