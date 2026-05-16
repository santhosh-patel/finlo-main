-- Fix for case-sensitive email matching in invitations
-- This ensures that if a user signed up with "Hari@finlo.ai" but was invited as "hari@finlo.ai", they can still see the invite.

DROP POLICY IF EXISTS "Invitees can view their own invites" ON public.household_invites;

CREATE POLICY "Invitees can view their own invites"
ON public.household_invites FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() AND LOWER(email) = LOWER(household_invites.email)
    )
    OR 
    LOWER(auth.email()) = LOWER(household_invites.email)
);
