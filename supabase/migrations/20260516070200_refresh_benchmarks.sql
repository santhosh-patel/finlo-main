-- Function to refresh the benchmarking view
CREATE OR REPLACE FUNCTION public.refresh_benchmarking_view()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.anonymous_category_averages;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- In a real environment, you would schedule this with pg_cron
-- SELECT cron.schedule('0 0 * * *', 'SELECT refresh_benchmarking_view()');
