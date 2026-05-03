# Plan

## 1. CSV export filename includes filter context

`src/components/SearchOverlay.tsx` — build filename like:
`ledger_<category|all>_<from>_to_<to>.csv` (slugify category, fall back to `all`, use earliest expense date if `from` empty, today if `to` empty).

## 2. One-click reset for chips + date range

`src/components/SearchFilters.tsx` — promote the existing "Clear filters" link to a visible pill button next to the chips when any chip/date is active. Resets `query` (optional), `category`, `from`, `to` together.

## 3. Inline subcategory edit in details drawer

`src/components/ExpenseDetailsDrawer.tsx` — when editing and the selected category has `subcategories.length > 0`, render a chip row (same style as AddExpenseSheet) plus a "+ New" inline input that calls `onAddSubcategory(category, name)`. Wire a new `addSubcategory` mutator in `useExpenses` that updates the matching `CategoryDef`.

## 4. Budget limits in budgets sheet

Already present in `BudgetsSheet.tsx` — confirm and polish:

- Add "Clear all" action
- Keep per-row progress bar (already there)

## 5. Navigable Today / Week / Month with totals + drill-down

Big change. Replace fixed "today / last 7 days / current month" with a **period navigator**.

### `src/lib/expenses.ts`

Add helpers:

- `addDays(iso, n)`, `addWeeks`, `addMonths`
- `weekRange(anchorISO)` → `{ from, to, label }` (Mon–Sun)
- `monthRange(anchorISO)` → `{ from, to, label }` (e.g. "March 2026")
- `dayRange(iso)` → label "Yesterday" / "Day before yesterday" / `fullDateLabel`

### `src/pages/Index.tsx`

- New state: `anchorDate` (ISO) per view, defaulting to today / this week / this month.
- Hero total now reflects the selected period (not always today).
- Add `‹  [period label]  ›` arrows under header; right arrow disabled when at current period.

### Today view

Show:

- Today's total + list (existing)
- Two collapsible cards: **Yesterday** (₹total) and **Day before yesterday** (₹total). Tapping expands to show that day's transactions inline (uses `<Collapsible>` from shadcn).

### Week view (`WeeklyView.tsx`)

- Show week range label + week total at top
- Bars for that week's 7 days
- Below bars: list of all transactions in the week, grouped by day (collapsible per day showing day total).
- Accept `anchorDate` prop and arrow handlers from Index.

### Month view (`MonthlyView.tsx`)

- Show selected month name + month total (driven by `anchorDate`)
- Existing category breakdown + budgets stay
- New: collapsible "All transactions" section grouped by day.

## 6. Excel + CSV import

New `src/components/ImportSheet.tsx`:

- File picker accepting `.csv, .xlsx, .xls`
- Use `xlsx` (SheetJS) library — parses both Excel and CSV uniformly
- Map columns: Date, Amount, Category, Subcategory, Note, Payment (case-insensitive headers; matches our CSV export)
- Show preview table with row-level validation (skip invalid rows, show count)
- "Import N rows" button → calls `addExpense` for each (auto-creates missing categories)
Triggered from new Settings page.

Add dependency: `xlsx`.

## 7. Add new subcategory anywhere category is shown

- AddExpenseSheet: under the subcategory chip row, add `+ New subcategory` inline input (only when a category is selected).
- ExpenseDetailsDrawer (edit mode): same.
- Settings → Manage categories: full CRUD.
Wire to new `addSubcategory(category, name)` in `useExpenses`.

## 8. Settings (replace logout button with a settings gear; logout moves inside)

New `src/pages/Settings.tsx` opened as a full sheet from a gear icon in the header. Sections:

1. **Profile** — edit display name, change password (stored locally; updates `useAuth` to accept current password). Note: this is local-only since the app isn't using Lovable Cloud auth.
2. **Categories** — list with: rename, delete, add subcategory, delete subcategory, **pick color** (color swatch grid), **pick icon** (curated lucide icon list, e.g. Utensils, ShoppingCart, Car, Plug, Shirt, Home, Wallet, Heart, Film, etc.). Stored on `CategoryDef` as `color?: string; icon?: string;`.
3. **Transactions** — link that opens search overlay (already supports edit + delete).
4. **Budgets** — opens budgets sheet.
5. **Import data** — opens ImportSheet.
6. **Appearance** — theme color picker (sets a CSS variable like `--accent` on `:root`); light/dark toggle. Persisted in `localStorage`.
7. **Sign out** — moved here.

### `src/lib/expenses.ts`

Extend `CategoryDef` with optional `color` and `icon` (string key from a fixed list).

### `src/components/ExpenseRow.tsx`, MonthlyView, WeeklyView

Render the category icon + colored dot/chip when set.

## 9. Other gaps worth implementing (asking before doing)

Beyond your list, these would meaningfully improve the app:

- **Recurring expenses** (rent, subscriptions auto-added monthly)
- **Payment method filter** in Search
- **"This year" view** + year-over-year compare
- **Empty/zero-amount day indicator on weekly bars**
- **Show in weekly bars in category vise colored bars in one bar**
- **Top 5 transactions of the period** card on Month view
- **Backup/restore JSON** (full data export beyond CSV)
- **PWA install + offline** (the app is local-only — would feel native on phone)
- **Keyboard shortcuts** (n = new expense, / = search)
- **Share/print monthly report PDF**
- **Currency setting** (right now ₹ is hardcoded)
- **Migrate to Lovable Cloud** so data syncs across devices and the login is real (you've been declining this — flagging again because as features grow, localStorage will eventually bite you on data loss / device switch).

## Technical notes

- All data still in `localStorage` via `useExpenses` — extending it with `addSubcategory`, `renameCategory`, `deleteCategory`, `setCategoryStyle`.
- Theme color: write CSS variable on `<html>` from a Settings provider; persist key `ledger.theme.v1`.
- Profile/password: store hashed-ish in localStorage (`ledger.profile.v1`); keep default credentials as fallback.
- Imports: `xlsx` library handles both `.xlsx` and `.csv` parsing → unified row objects.

## Files touched

- New: `src/pages/Settings.tsx`, `src/components/ImportSheet.tsx`, `src/components/PeriodNav.tsx`, `src/components/CategoryEditor.tsx`
- Edit: `src/pages/Index.tsx`, `src/hooks/useExpenses.ts`, `src/hooks/useAuth.ts`, `src/lib/expenses.ts`, `src/components/SearchOverlay.tsx`, `src/components/SearchFilters.tsx`, `src/components/AddExpenseSheet.tsx`, `src/components/ExpenseDetailsDrawer.tsx`, `src/components/WeeklyView.tsx`, `src/components/MonthlyView.tsx`, `src/components/BudgetsSheet.tsx`, `src/components/ExpenseRow.tsx`, `src/index.css`

## Question before I start

The "Other gaps" list (section 9) is long. Want me to ship sections 1–8 first, then we tackle extras in a follow-up? Or pick specific extras to bundle in now?