-- Update RLS policies to allow admins/support impersonation to insert, update, and delete expenses, categories, and budgets.

-- 1. Expenses
DROP POLICY IF EXISTS "Expenses insert own" ON public.expenses;
CREATE POLICY "Expenses insert own/admin" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Expenses update own" ON public.expenses;
CREATE POLICY "Expenses update own/admin" ON public.expenses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Expenses delete own" ON public.expenses;
CREATE POLICY "Expenses delete own/admin" ON public.expenses FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 2. Categories
DROP POLICY IF EXISTS "Categories own all" ON public.categories;
CREATE POLICY "Categories own/admin all" ON public.categories FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 3. Budgets
DROP POLICY IF EXISTS "Budgets own all" ON public.budgets;
CREATE POLICY "Budgets own/admin all" ON public.budgets FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
