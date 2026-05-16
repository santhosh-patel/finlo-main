-- Fix missing 'url' column in notifications table and update trigger

-- 1. Ensure 'url' column exists
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS url TEXT;

-- 2. Update the centralized push notification trigger to be more resilient
CREATE OR REPLACE FUNCTION public.on_notification_inserted()
RETURNS TRIGGER AS $$
DECLARE
    service_role_key TEXT;
    final_url TEXT;
BEGIN
    -- Get the service role key
    service_role_key := public.get_app_secret('service_role_key');

    IF service_role_key IS NOT NULL THEN
        -- Safely determine the URL to send
        final_url := COALESCE(NEW.link, NEW.url, '/');

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
              'url', final_url,
              'link', final_url -- Send both for backward/forward compatibility
            )
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
