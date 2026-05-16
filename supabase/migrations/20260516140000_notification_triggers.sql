-- Trigger to notify partner when a shared expense is added
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
            INSERT INTO public.notifications (user_id, title, body, kind, link)
            VALUES (
                partner_id,
                'New Shared Expense',
                adder_name || ' added ' || NEW.category || ': ₹' || NEW.amount,
                'expense',
                '/?view=household'
            );

            -- Call the Edge Function to send Push
            -- (Requires pg_net extension enabled in Supabase)
            -- Note: In production, ensure the service_role_key is available in the vault or as a setting.
            PERFORM
              net.http_post(
                url := 'https://ldjoegwamvaivitifozw.supabase.co/functions/v1/send-push',
                headers := jsonb_build_object(
                  'Content-Type', 'application/json',
                  'Authorization', 'Bearer ' || (SELECT value FROM auth.secrets WHERE name = 'service_role_key' LIMIT 1)
                ),
                body := jsonb_build_object(
                  'user_id', partner_id,
                  'title', 'Shared Expense',
                  'body', adder_name || ' added ' || NEW.category || ': ₹' || NEW.amount,
                  'url', '/?view=household'
                )
              );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_shared_expense_added ON public.expenses;
CREATE TRIGGER on_shared_expense_added
AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.notify_shared_expense();
