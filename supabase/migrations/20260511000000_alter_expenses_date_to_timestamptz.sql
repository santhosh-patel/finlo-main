-- Alter public.expenses.date column from DATE to TIMESTAMPTZ to support time selection preservation
ALTER TABLE public.expenses 
  ALTER COLUMN date TYPE timestamptz USING date::timestamptz;
