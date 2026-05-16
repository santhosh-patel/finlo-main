-- Drop the materialized view temporarily if it exists (it will be recreated by a later migration)
DROP MATERIALIZED VIEW IF EXISTS public.anonymous_category_averages CASCADE;

-- Alter public.expenses.date column from DATE to TIMESTAMPTZ to support time selection preservation
ALTER TABLE public.expenses 
  ALTER COLUMN date TYPE timestamptz USING date::timestamptz;
