CREATE POLICY "Mart owners can read sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (is_mart_owner(auth.uid(), mart_id));