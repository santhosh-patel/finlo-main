-- Fix infinite recursion in household_invites RLS policies
-- Standardize on using security definer functions to look up user email and household_id.

-- 1. Drop old conflicting policies
DROP POLICY IF EXISTS "Inviter can view their own invites" ON public.household_invites;
DROP POLICY IF EXISTS "Invitees can view their own invites by email" ON public.household_invites;
DROP POLICY IF EXISTS "Invitees can view their own invites" ON public.household_invites;

-- 2. Create a unified, recursion-free SELECT policy
CREATE POLICY "Household Invites: view relevant invites"
  ON public.household_invites
  FOR SELECT
  TO authenticated
  USING (
    -- Case 1: You are the inviter
    inviter_id = auth.uid()
    OR
    -- Case 2: You are the invitee (matching via profiles email - using SECURITY DEFINER helper)
    LOWER(TRIM(email)) = LOWER(TRIM(public.get_my_email()))
    OR
    -- Case 3: You are the invitee (matching via auth.email())
    LOWER(TRIM(email)) = LOWER(TRIM(auth.email()))
  );

-- 3. Also fix the UPDATE policy for invites which was also using profiles directly
DROP POLICY IF EXISTS "Invitees can update their own invites" ON public.household_invites;
CREATE POLICY "Invitees can update their own invites"
  ON public.household_invites
  FOR UPDATE
  TO authenticated
  USING (
    LOWER(TRIM(email)) = LOWER(TRIM(public.get_my_email()))
    OR
    LOWER(TRIM(email)) = LOWER(TRIM(auth.email()))
  )
  WITH CHECK (
    LOWER(TRIM(email)) = LOWER(TRIM(public.get_my_email()))
    OR
    LOWER(TRIM(email)) = LOWER(TRIM(auth.email()))
  );
