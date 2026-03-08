
-- Enum for user roles
CREATE TYPE public.app_role AS ENUM ('customer', 'cashier', 'admin');

-- Enum for cart states
CREATE TYPE public.cart_state AS ENUM ('CREATED', 'ACTIVE', 'LOCKED', 'VERIFIED', 'PAID', 'CLOSED');

-- Enum for payment methods
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'upi_counter', 'upi_app', 'razorpay');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Marts table
CREATE TABLE public.marts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  logo_url TEXT,
  customer_pay_from_app BOOLEAN NOT NULL DEFAULT false,
  upi_id TEXT,
  merchant_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Branches table
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mart_id UUID NOT NULL REFERENCES public.marts(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,
  inventory_api_url TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employees table (cashiers linked to marts)
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mart_id UUID NOT NULL REFERENCES public.marts(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, mart_id)
);

-- Shopping sessions
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mart_id UUID NOT NULL REFERENCES public.marts(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  state cart_state NOT NULL DEFAULT 'ACTIVE',
  cart_hash TEXT,
  payment_method payment_method,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cart items
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  image_url TEXT,
  price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, barcode)
);

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  method payment_method NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  mart_id UUID NOT NULL REFERENCES public.marts(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '[]',
  total_quantity INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check if user is mart owner
CREATE OR REPLACE FUNCTION public.is_mart_owner(_user_id UUID, _mart_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marts WHERE id = _mart_id AND owner_id = _user_id
  )
$$;

-- Function to check if user is employee of mart
CREATE OR REPLACE FUNCTION public.is_mart_employee(_user_id UUID, _mart_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees WHERE user_id = _user_id AND mart_id = _mart_id AND is_active = true
  )
$$;

-- Auto-create profile + customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generate session code
CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.session_code := 'QLS-' || upper(substr(md5(random()::text), 1, 8));
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_session_code
  BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.generate_session_code();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles: users can read/update own profile; cashiers can read customer profiles
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Cashiers can read profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'cashier'));
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User roles: users can read own roles
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Marts: public read, owner can manage
CREATE POLICY "Anyone can read marts" ON public.marts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage marts" ON public.marts FOR ALL USING (auth.uid() = owner_id);

-- Branches: public read, mart owner can manage
CREATE POLICY "Anyone can read branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mart owners can manage branches" ON public.branches FOR ALL USING (public.is_mart_owner(auth.uid(), mart_id));

-- Employees: mart owner can manage, employees can read own
CREATE POLICY "Employees can read own" ON public.employees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Mart owners can manage employees" ON public.employees FOR ALL USING (public.is_mart_owner(auth.uid(), mart_id));

-- Sessions: customer owns session, cashier/admin can read mart sessions
CREATE POLICY "Customers can read own sessions" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Customers can insert sessions" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Customers can update own active sessions" ON public.sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Cashiers can read mart sessions" ON public.sessions FOR SELECT USING (public.is_mart_employee(auth.uid(), mart_id));
CREATE POLICY "Cashiers can update mart sessions" ON public.sessions FOR UPDATE USING (public.is_mart_employee(auth.uid(), mart_id));

-- Cart items: session owner + cashier
CREATE POLICY "Session owner can manage items" ON public.cart_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
CREATE POLICY "Cashiers can manage cart items" ON public.cart_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND public.is_mart_employee(auth.uid(), s.mart_id))
);

-- Payments: session owner + cashier
CREATE POLICY "Session owner can read payments" ON public.payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
CREATE POLICY "Cashiers can manage payments" ON public.payments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND public.is_mart_employee(auth.uid(), s.mart_id))
);

-- Invoices: owner can read, cashier/admin can manage
CREATE POLICY "Users can read own invoices" ON public.invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Cashiers can manage invoices" ON public.invoices FOR ALL USING (
  public.is_mart_employee(auth.uid(), mart_id)
);

-- Audit logs: admins can read, system can insert
CREATE POLICY "Admins can read audit logs" ON public.audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime for sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
