-- Create receipts storage bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for the receipts storage bucket
CREATE POLICY "Allow public SELECT on receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts');

CREATE POLICY "Allow authenticated INSERT on receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Allow authenticated DELETE on receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'receipts');
