-- Financial Pulse System

-- 1. Daily Pulses Table
CREATE TABLE IF NOT EXISTS public.daily_pulses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL, -- 'morning_pulse', 'budget_alert', 'weekend_plan', 'anomaly'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metrics JSONB DEFAULT '{}'::jsonb, -- yesterday_spend, safe_to_spend, etc.
    actions JSONB DEFAULT '[]'::jsonb, -- Array of { label, type, payload }
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.daily_pulses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pulses"
ON public.daily_pulses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own pulses (mark as read)"
ON public.daily_pulses FOR UPDATE
USING (auth.uid() = user_id);

-- 2. Materialized View for Anonymous Benchmarking
-- This calculates average spend per category across all users.
-- We refresh this periodically via a cron job.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.anonymous_category_averages AS
SELECT 
    category,
    AVG(amount) as avg_amount,
    COUNT(*) as transaction_count
FROM public.expenses
WHERE date > now() - interval '30 days'
GROUP BY category;

CREATE UNIQUE INDEX IF NOT EXISTS idx_anon_cat_avg_category ON public.anonymous_category_averages (category);

-- 3. Trigger for Event-Driven Budget Alerts
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

    IF FOUND AND user_budget.amount > 0 THEN
        -- Calculate total spent in this category this month
        SELECT COALESCE(SUM(amount), 0) INTO spent_so_far
        FROM public.expenses
        WHERE user_id = NEW.user_id 
          AND category = NEW.category
          AND date >= date_trunc('month', now())
          AND date <= now();

        -- Check if we crossed 80% or 100%
        IF spent_so_far >= user_budget.amount THEN
            INSERT INTO public.daily_pulses (user_id, type, title, content, actions)
            VALUES (
                NEW.user_id, 
                'budget_alert', 
                'Budget Exceeded: ' || NEW.category,
                'You have spent ' || spent_so_far || ' on ' || NEW.category || ' this month, exceeding your budget of ' || user_budget.amount || '.',
                jsonb_build_array(
                    jsonb_build_object('label', 'Adjust Budget', 'type', 'navigate', 'payload', jsonb_build_object('target', 'budgets', 'category', NEW.category)),
                    jsonb_build_object('label', 'Review Transactions', 'type', 'navigate', 'payload', jsonb_build_object('target', 'search', 'category', NEW.category))
                )
            );
        ELSIF spent_so_far >= (user_budget.amount * 0.8) THEN
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
                    'You are at 80% of your ' || NEW.category || ' budget. You have ' || (user_budget.amount - spent_so_far) || ' left for the month.',
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

DROP TRIGGER IF EXISTS trigger_check_budget ON public.expenses;
CREATE TRIGGER trigger_check_budget
AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.check_budget_on_expense();
