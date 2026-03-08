
-- Fix function search path for generate_session_code
CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.session_code := 'QLS-' || upper(substr(md5(random()::text), 1, 8));
  RETURN NEW;
END;
$$;

-- Fix permissive RLS: tighten audit log insert policy
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert own audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
