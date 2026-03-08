
-- Fix all RLS policies: they were created as RESTRICTIVE but should be PERMISSIVE
-- Drop and recreate all policies as PERMISSIVE

-- ===== user_roles =====
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- ===== audit_logs =====
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;

CREATE POLICY "Admins can read audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own audit logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===== branches =====
DROP POLICY IF EXISTS "Anyone can read branches" ON public.branches;
DROP POLICY IF EXISTS "Mart owners can manage branches" ON public.branches;

CREATE POLICY "Anyone can read branches" ON public.branches FOR SELECT USING (true);
CREATE POLICY "Mart owners can manage branches" ON public.branches FOR ALL USING (is_mart_owner(auth.uid(), mart_id));

-- ===== cart_items =====
DROP POLICY IF EXISTS "Session owner can manage items" ON public.cart_items;
DROP POLICY IF EXISTS "Cashiers can manage cart items" ON public.cart_items;

CREATE POLICY "Session owner can manage items" ON public.cart_items FOR ALL USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = cart_items.session_id AND s.user_id = auth.uid()));
CREATE POLICY "Cashiers can manage cart items" ON public.cart_items FOR ALL USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = cart_items.session_id AND is_mart_employee(auth.uid(), s.mart_id)));

-- ===== employees =====
DROP POLICY IF EXISTS "Employees can read own" ON public.employees;
DROP POLICY IF EXISTS "Mart owners can manage employees" ON public.employees;

CREATE POLICY "Employees can read own" ON public.employees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Mart owners can manage employees" ON public.employees FOR ALL USING (is_mart_owner(auth.uid(), mart_id));

-- ===== invoices =====
DROP POLICY IF EXISTS "Users can read own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Cashiers can manage invoices" ON public.invoices;

CREATE POLICY "Users can read own invoices" ON public.invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Cashiers can manage invoices" ON public.invoices FOR ALL USING (is_mart_employee(auth.uid(), mart_id));

-- ===== marts =====
DROP POLICY IF EXISTS "Anyone can read marts" ON public.marts;
DROP POLICY IF EXISTS "Owners can manage marts" ON public.marts;

CREATE POLICY "Anyone can read marts" ON public.marts FOR SELECT USING (true);
CREATE POLICY "Owners can manage marts" ON public.marts FOR ALL USING (auth.uid() = owner_id);

-- ===== payments =====
DROP POLICY IF EXISTS "Session owner can read payments" ON public.payments;
DROP POLICY IF EXISTS "Cashiers can manage payments" ON public.payments;

CREATE POLICY "Session owner can read payments" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = payments.session_id AND s.user_id = auth.uid()));
CREATE POLICY "Cashiers can manage payments" ON public.payments FOR ALL USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = payments.session_id AND is_mart_employee(auth.uid(), s.mart_id)));

-- ===== products =====
DROP POLICY IF EXISTS "Anyone can read active products" ON public.products;
DROP POLICY IF EXISTS "Employees can read products" ON public.products;
DROP POLICY IF EXISTS "Mart owners can manage products" ON public.products;

CREATE POLICY "Anyone can read active products" ON public.products FOR SELECT USING (is_active = true);
CREATE POLICY "Employees can read products" ON public.products FOR SELECT USING (EXISTS (SELECT 1 FROM branches b WHERE b.id = products.branch_id AND is_mart_employee(auth.uid(), b.mart_id)));
CREATE POLICY "Mart owners can manage products" ON public.products FOR ALL USING (EXISTS (SELECT 1 FROM branches b WHERE b.id = products.branch_id AND is_mart_owner(auth.uid(), b.mart_id)));

-- ===== profiles =====
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Cashiers can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Cashiers can read profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'cashier'::app_role));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ===== sessions =====
DROP POLICY IF EXISTS "Customers can read own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Customers can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "Customers can update own active sessions" ON public.sessions;
DROP POLICY IF EXISTS "Cashiers can read mart sessions" ON public.sessions;
DROP POLICY IF EXISTS "Cashiers can update mart sessions" ON public.sessions;

CREATE POLICY "Customers can read own sessions" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Customers can insert sessions" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Customers can update own active sessions" ON public.sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Cashiers can read mart sessions" ON public.sessions FOR SELECT USING (is_mart_employee(auth.uid(), mart_id));
CREATE POLICY "Cashiers can update mart sessions" ON public.sessions FOR UPDATE USING (is_mart_employee(auth.uid(), mart_id));
