-- Optional note for split / reimbursable context (e.g. who owes what)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS split_note text;

COMMENT ON COLUMN public.expenses.split_note IS 'Short context for splits or reimbursement (e.g. names)';
