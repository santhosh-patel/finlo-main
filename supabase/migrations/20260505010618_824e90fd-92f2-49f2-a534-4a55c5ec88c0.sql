
CREATE TABLE public.recurring_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  note TEXT,
  payment_method TEXT NOT NULL DEFAULT 'upi',
  frequency TEXT NOT NULL DEFAULT 'monthly',
  day_of_month INTEGER,
  day_of_week INTEGER,
  next_due_date DATE NOT NULL,
  last_run_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recurring own all" ON public.recurring_expenses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_recurring_due ON public.recurring_expenses (next_due_date) WHERE active = TRUE;

CREATE TRIGGER recurring_expenses_set_updated
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
