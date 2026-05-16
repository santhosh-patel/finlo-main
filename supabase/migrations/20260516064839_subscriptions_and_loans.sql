
-- 1. Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  category TEXT NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'weekly')),
  next_billing_date DATE NOT NULL,
  alert_days_before INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Subscriptions own all') THEN
    CREATE POLICY "Subscriptions own all" ON public.subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Loan Payments Table
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  type TEXT NOT NULL DEFAULT 'principal' CHECK (type IN ('principal', 'interest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_payments' AND policyname = 'Loan payments own all') THEN
    CREATE POLICY "Loan payments own all" ON public.loan_payments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Update Loans Table
ALTER TABLE public.loans 
  ADD COLUMN IF NOT EXISTS interest_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_type TEXT DEFAULT 'none' CHECK (interest_type IN ('none', 'flat', 'simple', 'compound'));

-- 4. View for Loan Summaries (Optional but helpful)
CREATE OR REPLACE VIEW public.loan_summaries AS
SELECT 
  l.id,
  l.user_id,
  l.counterparty,
  l.amount as total_amount,
  COALESCE(SUM(lp.amount) FILTER (WHERE lp.type = 'principal'), 0) as paid_principal,
  COALESCE(SUM(lp.amount) FILTER (WHERE lp.type = 'interest'), 0) as paid_interest,
  l.amount - COALESCE(SUM(lp.amount) FILTER (WHERE lp.type = 'principal'), 0) as remaining_balance,
  l.status,
  l.direction,
  l.interest_rate,
  l.interest_type
FROM public.loans l
LEFT JOIN public.loan_payments lp ON l.id = lp.loan_id
GROUP BY l.id;
