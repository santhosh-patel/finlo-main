-- Align invite notification deep links with in-app routing (/?settings=household).

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
    '/?settings=household'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
