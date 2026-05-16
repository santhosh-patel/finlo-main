-- RLS Policies for Households table

-- 1. Allow any authenticated user to create a household
-- (Required for the initial setup of a shared space)
CREATE POLICY "Authenticated users can create households"
ON public.households FOR INSERT
TO authenticated
WITH CHECK (true);

-- 2. Allow all authenticated users to view household details
-- (Required so the creator can see the record they just made before their profile is updated)
CREATE POLICY "Authenticated users can view households"
ON public.households FOR SELECT
TO authenticated
USING (true);

-- 3. Allow members to update their own household (e.g., change name)
CREATE POLICY "Members can update their own household"
ON public.households FOR UPDATE
TO authenticated
USING (
    id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
)
WITH CHECK (
    id = (SELECT household_id FROM public.profiles WHERE user_id = auth.uid())
);

-- 4. Ensure profiles can be updated with a household_id
-- (Existing policy might only allow own profile update, which is fine, 
-- but let's make sure it's clear)
DROP POLICY IF EXISTS "Profiles: update own or admin" ON public.profiles;
CREATE POLICY "Profiles: update own or admin"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
