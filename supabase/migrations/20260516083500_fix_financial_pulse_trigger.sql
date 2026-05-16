-- 3. Trigger for Event-Driven Budget Alerts (Fix for amount_monthly column)
CREATE OR REPLACE FUNCTION public.check_budget_on_expense()
RETURNS TRIGGER AS $$
DECLARE
    user_budget RECORD;
    spent_so_far DECIMAL;
    pulse_content TEXT;
BEGIN
    -- Get the budget for this category
    SELECT * INTO user_budget 
    FROM public.budgets 
    WHERE user_id = NEW.user_id AND category = NEW.category;

    IF FOUND AND user_budget.amount_monthly > 0 THEN
        -- Calculate total spent in this category this month
        SELECT COALESCE(SUM(amount), 0) INTO spent_so_far
        FROM public.expenses
        WHERE user_id = NEW.user_id 
          AND category = NEW.category
          AND date >= date_trunc('month', now())
          AND date <= now();

        -- Check if we crossed 80% or 100%
        IF spent_so_far >= user_budget.amount_monthly THEN
            INSERT INTO public.daily_pulses (user_id, type, title, content, actions)
            VALUES (
                NEW.user_id, 
                'budget_alert', 
                'Budget Exceeded: ' || NEW.category,
                'You have spent ' || spent_so_far || ' on ' || NEW.category || ' this month, exceeding your budget of ' || user_budget.amount_monthly || '.',
                jsonb_build_array(
                    jsonb_build_object('label', 'Adjust Budget', 'type', 'navigate', 'payload', jsonb_build_object('target', 'budgets', 'category', NEW.category)),
                    jsonb_build_object('label', 'Review Transactions', 'type', 'navigate', 'payload', jsonb_build_object('target', 'search', 'category', NEW.category))
                )
            );
        ELSIF spent_so_far >= (user_budget.amount_monthly * 0.8) THEN
            -- Check if we already sent an 80% alert today to avoid spam
            IF NOT EXISTS (
                SELECT 1 FROM public.daily_pulses 
                WHERE user_id = NEW.user_id 
                  AND type = 'budget_alert' 
                  AND title LIKE 'Budget Alert: ' || NEW.category || '%'
                  AND created_at >= date_trunc('day', now())
            ) THEN
                INSERT INTO public.daily_pulses (user_id, type, title, content, actions)
                VALUES (
                    NEW.user_id, 
                    'budget_alert', 
                    'Budget Alert: ' || NEW.category,
                    'You are at 80% of your ' || NEW.category || ' budget. You have ' || (user_budget.amount_monthly - spent_so_far) || ' left for the month.',
                    jsonb_build_array(
                        jsonb_build_object('label', 'View Budgets', 'type', 'navigate', 'payload', jsonb_build_object('target', 'budgets'))
                    )
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
