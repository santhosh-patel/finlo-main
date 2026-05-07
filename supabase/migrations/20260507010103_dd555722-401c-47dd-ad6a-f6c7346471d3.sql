
REVOKE ALL ON FUNCTION public.compute_expense_base_amount() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_expense_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
