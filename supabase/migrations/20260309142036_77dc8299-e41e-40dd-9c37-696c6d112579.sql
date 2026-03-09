
-- Function to enforce cart item limits (max 50 unique items, max 99 quantity per item)
CREATE OR REPLACE FUNCTION public.enforce_cart_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item_count integer;
BEGIN
  -- Enforce max quantity per item
  IF NEW.quantity > 99 THEN
    RAISE EXCEPTION 'Maximum quantity per item is 99';
  END IF;

  IF NEW.quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be at least 1';
  END IF;

  -- Enforce max unique items per session (only on INSERT)
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO item_count
    FROM public.cart_items
    WHERE session_id = NEW.session_id;

    IF item_count >= 50 THEN
      RAISE EXCEPTION 'Maximum of 50 unique items per cart';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_cart_item_limits
  BEFORE INSERT OR UPDATE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cart_limits();

-- Function to auto-expire stale sessions (called via pg_cron or app-level)
-- For now, create a callable function that can be invoked periodically
CREATE OR REPLACE FUNCTION public.expire_stale_sessions(timeout_minutes integer DEFAULT 120)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.sessions
  SET state = 'CLOSED', updated_at = now()
  WHERE state IN ('ACTIVE', 'CREATED')
    AND updated_at < now() - (timeout_minutes || ' minutes')::interval;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
