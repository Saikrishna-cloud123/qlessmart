
-- Auto-assign admin role when a user creates a mart
CREATE OR REPLACE FUNCTION public.handle_mart_owner_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.owner_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_mart_created_assign_admin
  AFTER INSERT ON public.marts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_mart_owner_role();
