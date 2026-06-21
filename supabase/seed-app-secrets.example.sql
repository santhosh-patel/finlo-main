-- Run once per Supabase project (SQL Editor or migration hook).
-- Replace placeholder values before executing. Never commit real secrets.

INSERT INTO public.app_secrets (name, value)
VALUES
  ('service_role_key', 'YOUR_SERVICE_ROLE_KEY'),
  ('supabase_functions_url', 'https://YOUR_PROJECT_REF.supabase.co/functions/v1')
ON CONFLICT (name) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();
