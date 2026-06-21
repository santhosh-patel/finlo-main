-- Replace hardcoded Supabase project URLs with configurable app_secrets values.
-- Deployers must set these after migrations (see supabase/seed-app-secrets.example.sql).

CREATE OR REPLACE FUNCTION public.on_notification_inserted()
RETURNS TRIGGER AS $$
DECLARE
    service_role_key TEXT;
    functions_base_url TEXT;
    final_url TEXT;
BEGIN
    service_role_key := public.get_app_secret('service_role_key');
    functions_base_url := public.get_app_secret('supabase_functions_url');

    IF service_role_key IS NOT NULL AND functions_base_url IS NOT NULL THEN
        final_url := COALESCE(NEW.link, NEW.url, '/');

        PERFORM
          net.http_post(
            url := functions_base_url || '/send-push',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || service_role_key
            ),
            body := jsonb_build_object(
              'user_id', NEW.user_id,
              'title', NEW.title,
              'body', NEW.body,
              'url', final_url,
              'link', final_url
            )
          );
    ELSE
        RAISE WARNING 'service_role_key or supabase_functions_url missing in public.app_secrets. Push notification not sent.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
