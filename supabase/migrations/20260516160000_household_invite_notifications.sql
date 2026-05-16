-- Notify invitees when a household invite is created or resent.
-- Allow invitees to read inviter profiles for pending invites.

CREATE OR REPLACE FUNCTION public.notify_household_invite()
RETURNS TRIGGER AS $$
DECLARE
  invitee_id UUID;
  inviter_name TEXT;
  household_label TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO invitee_id
  FROM public.profiles
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
  LIMIT 1;

  IF invitee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(display_name), ''), split_part(email, '@', 1), 'A partner')
  INTO inviter_name
  FROM public.profiles
  WHERE user_id = NEW.inviter_id;

  SELECT COALESCE(NULLIF(TRIM(name), ''), 'Shared Space')
  INTO household_label
  FROM public.households
  WHERE id = NEW.household_id;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (
    invitee_id,
    'Household invitation',
    inviter_name || ' invited you to join “' || household_label || '”',
    'invite',
    '/settings?tab=household'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_household_invite_created ON public.household_invites;
CREATE TRIGGER on_household_invite_created
  AFTER INSERT ON public.household_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_household_invite();

DROP TRIGGER IF EXISTS on_household_invite_resent ON public.household_invites;
CREATE TRIGGER on_household_invite_resent
  AFTER UPDATE ON public.household_invites
  FOR EACH ROW
  WHEN (
    NEW.status = 'pending'
    AND NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION public.notify_household_invite();

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
          LOWER(TRIM(hi.email)) = LOWER(TRIM((SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid())))
          OR LOWER(TRIM(hi.email)) = LOWER(TRIM(auth.email()))
        )
    )
  );
