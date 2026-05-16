-- Fix for the Creator SELECT issue on households
-- This allows the person creating a household to immediately see the record they created

DROP POLICY IF EXISTS "Members can view their own household" ON public.households;
DROP POLICY IF EXISTS "Authenticated users can view households" ON public.households;

CREATE POLICY "Authenticated users can view households"
ON public.households FOR SELECT
TO authenticated
USING (true);
