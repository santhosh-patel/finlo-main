-- Database Health & Collaboration Fixes

-- 1. Add household_id to categories (to allow shared custom categories)
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id);

-- 2. Update assign_household_id trigger to cover categories
DROP TRIGGER IF EXISTS trigger_assign_household_categories ON public.categories;
CREATE TRIGGER trigger_assign_household_categories
BEFORE INSERT ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.assign_household_id();

-- 3. RLS for Categories (Shared Access)
CREATE POLICY "Shared Household Categories Access"
ON public.categories FOR SELECT
USING (
    household_id IS NOT NULL AND 
    household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Shared Household Categories Update"
ON public.categories FOR UPDATE
USING (
    household_id IS NOT NULL AND 
    household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

-- 4. Shared Management (Update/Delete) for Expenses, Budgets, Loans, Subscriptions
-- This allows household members to edit each other's shared data (e.g., adding reactions or correcting notes)

-- Expenses
CREATE POLICY "Shared Household Expenses Update" ON public.expenses FOR UPDATE
USING (household_id IS NOT NULL AND household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Shared Household Expenses Delete" ON public.expenses FOR DELETE
USING (household_id IS NOT NULL AND household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid()));

-- Budgets
CREATE POLICY "Shared Household Budgets Update" ON public.budgets FOR UPDATE
USING (household_id IS NOT NULL AND household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Shared Household Budgets Delete" ON public.budgets FOR DELETE
USING (household_id IS NOT NULL AND household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid()));

-- Loans
CREATE POLICY "Shared Household Loans Update" ON public.loans FOR UPDATE
USING (household_id IS NOT NULL AND household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Shared Household Loans Delete" ON public.loans FOR DELETE
USING (household_id IS NOT NULL AND household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid()));

-- 5. Household Invite Lifecycle Policies
-- This allows the full "Invite -> Accept" flow to work via the API

CREATE POLICY "Users can send invites"
ON public.household_invites FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "Invitees can update their own invites"
ON public.household_invites FOR UPDATE
TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND (email = household_invites.email OR auth.email() = household_invites.email)
));

CREATE POLICY "Inviters can delete their own invites"
ON public.household_invites FOR DELETE
TO authenticated
USING (auth.uid() = inviter_id);
