
-- Function to recalculate session total from cart_items
CREATE OR REPLACE FUNCTION public.recalculate_session_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_total numeric;
BEGIN
  SELECT COALESCE(SUM(price * quantity), 0)
  INTO new_total
  FROM public.cart_items
  WHERE session_id = COALESCE(NEW.session_id, OLD.session_id);

  UPDATE public.sessions
  SET total_amount = new_total,
      updated_at = now()
  WHERE id = COALESCE(NEW.session_id, OLD.session_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on cart_items insert/update/delete to recalculate total
CREATE TRIGGER recalculate_total_on_cart_change
  AFTER INSERT OR UPDATE OR DELETE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_session_total();

-- Function to compute cart hash server-side when session is locked
CREATE OR REPLACE FUNCTION public.compute_cart_hash_on_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  hash_input text;
BEGIN
  -- Only compute when transitioning to LOCKED
  IF NEW.state = 'LOCKED' AND (OLD.state IS DISTINCT FROM 'LOCKED') THEN
    SELECT string_agg(barcode || ':' || quantity::text, '|' ORDER BY barcode)
    INTO hash_input
    FROM public.cart_items
    WHERE session_id = NEW.id;

    IF hash_input IS NULL OR hash_input = '' THEN
      RAISE EXCEPTION 'Cannot lock an empty cart';
    END IF;

    NEW.cart_hash := upper(substr(md5(hash_input), 1, 8));
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger before update on sessions to compute hash on lock
CREATE TRIGGER compute_hash_on_session_lock
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_cart_hash_on_lock();
