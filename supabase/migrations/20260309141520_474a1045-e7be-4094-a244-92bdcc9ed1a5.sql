
-- Create a function to validate session state transitions
CREATE OR REPLACE FUNCTION public.validate_session_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  valid boolean;
BEGIN
  -- If state hasn't changed, allow
  IF OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;

  -- Define valid transitions: CREATED->ACTIVE, ACTIVE->LOCKED, ACTIVE->CLOSED (cancel),
  -- LOCKED->VERIFIED, LOCKED->ACTIVE (reject), VERIFIED->PAID, PAID->CLOSED
  valid := (
    (OLD.state = 'CREATED' AND NEW.state = 'ACTIVE') OR
    (OLD.state = 'ACTIVE'  AND NEW.state = 'LOCKED') OR
    (OLD.state = 'ACTIVE'  AND NEW.state = 'CLOSED') OR
    (OLD.state = 'LOCKED'  AND NEW.state = 'VERIFIED') OR
    (OLD.state = 'LOCKED'  AND NEW.state = 'ACTIVE') OR
    (OLD.state = 'VERIFIED' AND NEW.state = 'PAID') OR
    (OLD.state = 'PAID'    AND NEW.state = 'CLOSED')
  );

  IF NOT valid THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', OLD.state, NEW.state;
  END IF;

  -- Auto-set updated_at
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

-- Attach trigger to sessions table
CREATE TRIGGER enforce_session_state_transition
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_session_state_transition();
