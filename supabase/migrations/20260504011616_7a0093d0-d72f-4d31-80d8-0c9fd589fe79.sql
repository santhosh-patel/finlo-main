-- Backfill missing category colors with a deterministic palette based on name
DO $$
DECLARE
  palette text[] := ARRAY[
    '#E3D3C2','#D1D8CA','#C8D6E5','#F1D6B7','#E8C9D6',
    '#D6CFE8','#E0DDD5','#F4C2C2','#B8D8BA','#D6E5F4',
    '#FFD6A5','#FDFFB6','#CAFFBF','#9BF6FF','#A0C4FF',
    '#BDB2FF','#FFC6FF'
  ];
BEGIN
  UPDATE public.categories
  SET color = palette[ (abs(hashtext(coalesce(name,''))) % array_length(palette,1)) + 1 ]
  WHERE color IS NULL OR color = '';
END $$;