-- Relationship Finance: Households Foundation

-- 1. Households Table
CREATE TABLE IF NOT EXISTS public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- 2. Household Invites Table
CREATE TABLE IF NOT EXISTS public.household_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inviter can view their own invites"
ON public.household_invites FOR SELECT
USING (auth.uid() = inviter_id);

CREATE POLICY "Invitees can view their own invites by email"
ON public.household_invites FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND email = household_invites.email
));

-- 3. Schema Updates (Adding household_id to existing tables)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id);
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id);
ALTER TABLE public.daily_pulses ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id);

-- Add reactions to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- 4. RLS Policy Updates for Shared Access
-- Expenses
CREATE POLICY "Shared Household Expenses Access"
ON public.expenses FOR SELECT
USING (
    household_id IS NOT NULL AND 
    household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Budgets
CREATE POLICY "Shared Household Budgets Access"
ON public.budgets FOR SELECT
USING (
    household_id IS NOT NULL AND 
    household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Loans
CREATE POLICY "Shared Household Loans Access"
ON public.loans FOR SELECT
USING (
    household_id IS NOT NULL AND 
    household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Subscriptions
CREATE POLICY "Shared Household Subscriptions Access"
ON public.subscriptions FOR SELECT
USING (
    household_id IS NOT NULL AND 
    household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Daily Pulses
CREATE POLICY "Shared Household Pulses Access"
ON public.daily_pulses FOR SELECT
USING (
    household_id IS NOT NULL AND 
    household_id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

-- 5. Trigger to automatically assign household_id on insert
CREATE OR REPLACE FUNCTION public.assign_household_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.household_id IS NULL THEN
        SELECT household_id INTO NEW.household_id 
        FROM public.profiles 
        WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to all main tables
DROP TRIGGER IF EXISTS trigger_assign_household_expenses ON public.expenses;
CREATE TRIGGER trigger_assign_household_expenses
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.assign_household_id();

DROP TRIGGER IF EXISTS trigger_assign_household_budgets ON public.budgets;
CREATE TRIGGER trigger_assign_household_budgets
BEFORE INSERT ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.assign_household_id();

DROP TRIGGER IF EXISTS trigger_assign_household_loans ON public.loans;
CREATE TRIGGER trigger_assign_household_loans
BEFORE INSERT ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.assign_household_id();

DROP TRIGGER IF EXISTS trigger_assign_household_subscriptions ON public.subscriptions;
CREATE TRIGGER trigger_assign_household_subscriptions
BEFORE INSERT ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.assign_household_id();

DROP TRIGGER IF EXISTS trigger_assign_household_pulses ON public.daily_pulses;
CREATE TRIGGER trigger_assign_household_pulses
BEFORE INSERT ON public.daily_pulses
FOR EACH ROW EXECUTE FUNCTION public.assign_household_id();
