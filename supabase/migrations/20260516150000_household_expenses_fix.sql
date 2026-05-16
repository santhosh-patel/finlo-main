-- Household expenses: explicit sharing only (no auto-assign on insert).
-- Allow household members to read each other's profiles for attribution.

DROP TRIGGER IF EXISTS trigger_assign_household_expenses ON public.expenses;

CREATE POLICY "Profiles: select household members"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    household_id IS NOT NULL
    AND household_id = (
      SELECT p.household_id
      FROM public.profiles AS p
      WHERE p.user_id = auth.uid()
    )
  );
