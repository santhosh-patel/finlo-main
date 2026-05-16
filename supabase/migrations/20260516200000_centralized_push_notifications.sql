-- Centralized Push Notifications & Schema Unification

-- 1. Ensure notifications table has the correct columns (Phase 1 used kind/link/read_at)
DO $$ 
BEGIN 
    -- Add kind if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='kind') THEN
        ALTER TABLE public.notifications ADD COLUMN kind TEXT;
    END IF;
    -- Add link if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='link') THEN
        ALTER TABLE public.notifications ADD COLUMN link TEXT;
    END IF;
    -- Add read_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='read_at') THEN
        ALTER TABLE public.notifications ADD COLUMN read_at TIMESTAMPTZ;
    END IF;
END $$;

-- 2. Create the central push notification trigger function
-- This function will be called whenever a row is inserted into public.notifications.
-- It will automatically send a push notification to the user.
CREATE OR REPLACE FUNCTION public.on_notification_inserted()
RETURNS TRIGGER AS $$
DECLARE
    service_role_key TEXT;
BEGIN
    -- Get the service role key from vault or secrets
    -- Note: In Supabase, secrets are often in auth.secrets or can be passed via vault.
    -- For now, we assume it's available in auth.secrets as configured in previous migrations.
    SELECT value INTO service_role_key FROM auth.secrets WHERE name = 'service_role_key' LIMIT 1;

    IF service_role_key IS NOT NULL THEN
        PERFORM
          net.http_post(
            url := 'https://ldjoegwamvaivitifozw.supabase.co/functions/v1/send-push',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || service_role_key
            ),
            body := jsonb_build_object(
              'user_id', NEW.user_id,
              'title', NEW.title,
              'body', NEW.body,
              'url', COALESCE(NEW.link, NEW.url, '/') -- Handle both link and url
            )
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Attach the trigger to notifications table
DROP TRIGGER IF EXISTS trg_send_push_on_notification ON public.notifications;
CREATE TRIGGER trg_send_push_on_notification
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.on_notification_inserted();

-- 4. Clean up direct push calls in other triggers (to avoid double notifications)
-- Update notify_shared_expense to only insert into notifications
CREATE OR REPLACE FUNCTION public.notify_shared_expense()
RETURNS TRIGGER AS $$
DECLARE
    partner_id UUID;
    partner_name TEXT;
    adder_name TEXT;
BEGIN
    IF NEW.household_id IS NOT NULL THEN
        -- Find the other member in the household
        SELECT user_id, display_name INTO partner_id, partner_name
        FROM public.profiles
        WHERE household_id = NEW.household_id AND user_id != NEW.user_id
        LIMIT 1;

        IF partner_id IS NOT NULL THEN
            -- Get adder's name
            SELECT COALESCE(display_name, 'Your partner') INTO adder_name
            FROM public.profiles
            WHERE user_id = NEW.user_id;

            -- Insert into internal notifications table
            -- The trg_send_push_on_notification will handle the actual push delivery.
            INSERT INTO public.notifications (user_id, title, body, kind, link)
            VALUES (
                partner_id,
                'New Shared Expense',
                adder_name || ' added ' || NEW.category || ': ₹' || NEW.amount,
                'expense',
                '/?view=household'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
