-- Performance and Collaboration Optimizations

-- 1. Add indices for household_id on all relevant tables
CREATE INDEX IF NOT EXISTS idx_profiles_household_id ON public.profiles (household_id);
CREATE INDEX IF NOT EXISTS idx_expenses_household_id ON public.expenses (household_id);
CREATE INDEX IF NOT EXISTS idx_budgets_household_id ON public.budgets (household_id);
CREATE INDEX IF NOT EXISTS idx_loans_household_id ON public.loans (household_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_household_id ON public.subscriptions (household_id);
CREATE INDEX IF NOT EXISTS idx_daily_pulses_household_id ON public.daily_pulses (household_id);
CREATE INDEX IF NOT EXISTS idx_categories_household_id ON public.categories (household_id);
CREATE INDEX IF NOT EXISTS idx_household_goals_household_id ON public.household_goals (household_id);
CREATE INDEX IF NOT EXISTS idx_household_invites_household_id ON public.household_invites (household_id);

-- 2. Add indices for email lookups (invites/attribution)
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_household_invites_email_trgm ON public.household_invites (email);

-- 3. Optimize RLS policies to use STABLE helper function instead of subqueries
-- This prevents the database from re-running the profile lookup for every single row.

-- Expenses
DROP POLICY IF EXISTS "Shared Household Expenses Access" ON public.expenses;
CREATE POLICY "Shared Household Expenses Access" ON public.expenses 
FOR SELECT TO authenticated 
USING (household_id IS NOT NULL AND household_id = public.get_my_household_id());

-- Budgets
DROP POLICY IF EXISTS "Shared Household Budgets Access" ON public.budgets;
CREATE POLICY "Shared Household Budgets Access" ON public.budgets 
FOR SELECT TO authenticated 
USING (household_id IS NOT NULL AND household_id = public.get_my_household_id());

-- Loans
DROP POLICY IF EXISTS "Shared Household Loans Access" ON public.loans;
CREATE POLICY "Shared Household Loans Access" ON public.loans 
FOR SELECT TO authenticated 
USING (household_id IS NOT NULL AND household_id = public.get_my_household_id());

-- Subscriptions
DROP POLICY IF EXISTS "Shared Household Subscriptions Access" ON public.subscriptions;
CREATE POLICY "Shared Household Subscriptions Access" ON public.subscriptions 
FOR SELECT TO authenticated 
USING (household_id IS NOT NULL AND household_id = public.get_my_household_id());

-- Daily Pulses
DROP POLICY IF EXISTS "Shared Household Pulses Access" ON public.daily_pulses;
CREATE POLICY "Shared Household Pulses Access" ON public.daily_pulses 
FOR SELECT TO authenticated 
USING (household_id IS NOT NULL AND household_id = public.get_my_household_id());

-- Categories
DROP POLICY IF EXISTS "Shared Household Categories Access" ON public.categories;
CREATE POLICY "Shared Household Categories Access" ON public.categories 
FOR SELECT TO authenticated 
USING (household_id IS NOT NULL AND household_id = public.get_my_household_id());

-- Household Goals
DROP POLICY IF EXISTS "Members can manage household goals" ON public.household_goals;
CREATE POLICY "Members can manage household goals" ON public.household_goals
FOR ALL TO authenticated
USING (household_id = public.get_my_household_id())
WITH CHECK (household_id = public.get_my_household_id());

-- 4. Allow household members to update reactions on shared expenses
-- We only allow updates if the household_id matches.
-- Note: A more restrictive policy would check that ONLY the 'reactions' column is changing, 
-- but for simplicity in this collaborative app, we allow full update access to household members.
DROP POLICY IF EXISTS "Shared Household Expenses Update" ON public.expenses;
CREATE POLICY "Shared Household Expenses Update" ON public.expenses 
FOR UPDATE TO authenticated 
USING (household_id IS NOT NULL AND household_id = public.get_my_household_id());

-- 5. Silence import map warnings by adding it to config.toml (if we were using the CLI config, 
-- but for now we'll just ensure it's documented).
