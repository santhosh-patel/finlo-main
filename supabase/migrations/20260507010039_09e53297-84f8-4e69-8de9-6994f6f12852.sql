
-- ============== Phase 1: Money model foundation ==============

-- 1.1 expenses: type, currency, fx, reimbursable, soft-delete, receipt, auto-gen, client clock, import hash
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_amount numeric,
  ADD COLUMN IF NOT EXISTS is_reimbursable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reimbursed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS import_hash text;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_type_check;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_type_check CHECK (type IN ('expense','income'));

-- backfill base_amount where null
UPDATE public.expenses SET base_amount = amount WHERE base_amount IS NULL;

-- trigger to keep base_amount in sync
CREATE OR REPLACE FUNCTION public.compute_expense_base_amount()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.fx_rate IS NULL OR NEW.fx_rate = 0 THEN NEW.fx_rate := 1; END IF;
  NEW.base_amount := NEW.amount * NEW.fx_rate;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_compute_expense_base ON public.expenses;
CREATE TRIGGER trg_compute_expense_base
  BEFORE INSERT OR UPDATE OF amount, fx_rate ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.compute_expense_base_amount();

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_cat_date ON public.expenses (user_id, category, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_type_date ON public.expenses (user_id, type, date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_imphash
  ON public.expenses (user_id, import_hash) WHERE import_hash IS NOT NULL;

-- 1.2 fx_rates
CREATE TABLE IF NOT EXISTS public.fx_rates (
  date date NOT NULL,
  base text NOT NULL,
  quote text NOT NULL,
  rate numeric NOT NULL,
  PRIMARY KEY (date, base, quote)
);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FX rates readable" ON public.fx_rates;
CREATE POLICY "FX rates readable" ON public.fx_rates FOR SELECT TO authenticated USING (true);

-- 1.3 tags + expense_tags + splits
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tags own all" ON public.tags;
CREATE POLICY "Tags own all" ON public.tags FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.expense_tags (
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (expense_id, tag_id)
);
ALTER TABLE public.expense_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ExpenseTags own all" ON public.expense_tags;
CREATE POLICY "ExpenseTags own all" ON public.expense_tags FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL,
  subcategory text,
  amount numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Splits own all" ON public.expense_splits;
CREATE POLICY "Splits own all" ON public.expense_splits FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 1.4 loans
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  counterparty text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  direction text NOT NULL CHECK (direction IN ('lent','borrowed')),
  date date NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','settled')),
  note text,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Loans own all" ON public.loans;
CREATE POLICY "Loans own all" ON public.loans FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_loans_updated ON public.loans;
CREATE TRIGGER trg_loans_updated BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.3 expense_history (audit/restore)
CREATE TABLE IF NOT EXISTS public.expense_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL,
  user_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  action text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "History own read" ON public.expense_history;
CREATE POLICY "History own read" ON public.expense_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.write_expense_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.expense_history (expense_id, user_id, snapshot, action)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.user_id, OLD.user_id),
    to_jsonb(COALESCE(OLD, NEW)),
    TG_OP
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_expense_history ON public.expenses;
CREATE TRIGGER trg_expense_history
  AFTER UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.write_expense_history();

-- 5.1 notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notif own all" ON public.notifications;
CREATE POLICY "Notif own all" ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_created ON public.notifications (user_id, created_at DESC);

-- 3.4 insight_cache
CREATE TABLE IF NOT EXISTS public.insight_cache (
  user_id uuid NOT NULL,
  key text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
ALTER TABLE public.insight_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Insight own all" ON public.insight_cache;
CREATE POLICY "Insight own all" ON public.insight_cache FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3.2 category_suggestions
CREATE TABLE IF NOT EXISTS public.category_suggestions (
  user_id uuid NOT NULL,
  note_normalized text NOT NULL,
  category text NOT NULL,
  subcategory text,
  confidence numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, note_normalized)
);
ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CatSugg own all" ON public.category_suggestions;
CREATE POLICY "CatSugg own all" ON public.category_suggestions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Realtime publication (2.1)
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
