-- Phase 4: Enable realtime for cart_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cart_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
  END IF;
END $$;

-- Phase 5: Add config_snapshot to sessions
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS config_snapshot jsonb DEFAULT NULL;