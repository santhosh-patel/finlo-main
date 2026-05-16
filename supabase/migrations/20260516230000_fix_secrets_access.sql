-- Fix for missing auth.secrets table and centralized secret management

-- 1. Create a secure internal secrets table in the public schema (or a custom schema)
-- We use public here for simplicity, but RLS will restrict it to only the service_role and triggers.
CREATE TABLE IF NOT EXISTS public.app_secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- No one can read/write to this table via the API (not even authenticated users)
-- Only superusers/service_role and SECURITY DEFINER functions can access it.

-- 2. Helper function to get a secret (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_app_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (SELECT value FROM public.app_secrets WHERE name = secret_name LIMIT 1);
END;
$$;

-- 3. Update the centralized push notification trigger to use the new helper
CREATE OR REPLACE FUNCTION public.on_notification_inserted()
RETURNS TRIGGER AS $$
DECLARE
    service_role_key TEXT;
BEGIN
    -- Get the service role key using the new helper
    service_role_key := public.get_app_secret('service_role_key');

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
              'url', COALESCE(NEW.link, NEW.url, '/')
            )
          );
    ELSE
        -- Log warning if secret is missing (optional)
        RAISE WARNING 'service_role_key is missing in public.app_secrets. Push notification not sent.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
