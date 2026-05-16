-- Household Goals Notification Triggers

-- Trigger to notify partner when a shared goal is created or updated
CREATE OR REPLACE FUNCTION public.notify_household_goal_change()
RETURNS TRIGGER AS $$
DECLARE
    partner_id UUID;
    partner_name TEXT;
    actor_name TEXT;
    household_label TEXT;
BEGIN
    -- Find the other member in the household
    SELECT user_id, display_name INTO partner_id, partner_name
    FROM public.profiles
    WHERE household_id = NEW.household_id AND user_id != auth.uid()
    LIMIT 1;

    IF partner_id IS NOT NULL THEN
        -- Get actor's name
        SELECT COALESCE(NULLIF(TRIM(display_name), ''), split_part(email, '@', 1), 'Your partner') 
        INTO actor_name
        FROM public.profiles
        WHERE user_id = auth.uid();

        IF (TG_OP = 'INSERT') THEN
            -- Insert into notifications table
            INSERT INTO public.notifications (user_id, title, body, kind, link)
            VALUES (
                partner_id,
                'New Shared Goal',
                actor_name || ' created a new goal: "' || NEW.title || '" with a target of ₹' || NEW.target_amount,
                'goal',
                '/?view=household'
            );
        ELSIF (TG_OP = 'UPDATE' AND NEW.current_amount > OLD.current_amount) THEN
            -- Contribution detected
            INSERT INTO public.notifications (user_id, title, body, kind, link)
            VALUES (
                partner_id,
                'Goal Contribution',
                actor_name || ' added ₹' || (NEW.current_amount - OLD.current_amount)::TEXT || ' to the goal "' || NEW.title || '"',
                'goal',
                '/?view=household'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to household_goals
DROP TRIGGER IF EXISTS trg_notify_household_goal_change ON public.household_goals;
CREATE TRIGGER trg_notify_household_goal_change
AFTER INSERT OR UPDATE ON public.household_goals
FOR EACH ROW EXECUTE FUNCTION public.notify_household_goal_change();
