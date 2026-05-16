-- Fix infinite recursion in profiles RLS policies by using security definer functions
-- to look up current user's household_id and email without triggering RLS.

CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE user_id = auth.uid();
$$;

-- Redefine "Profiles: select household members"
DROP POLICY IF EXISTS "Profiles: select household members" ON public.profiles;
CREATE POLICY "Profiles: select household members"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    household_id IS NOT NULL
    AND household_id = public.get_my_household_id()
  );

-- Redefine "Profiles: view pending inviters"
DROP POLICY IF EXISTS "Profiles: view pending inviters" ON public.profiles;
CREATE POLICY "Profiles: view pending inviters"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.household_invites hi
      WHERE hi.inviter_id = profiles.user_id
        AND hi.status = 'pending'
        AND (
          LOWER(TRIM(hi.email)) = LOWER(TRIM(public.get_my_email()))
          OR LOWER(TRIM(hi.email)) = LOWER(TRIM(auth.email()))
        )
    )
  );
