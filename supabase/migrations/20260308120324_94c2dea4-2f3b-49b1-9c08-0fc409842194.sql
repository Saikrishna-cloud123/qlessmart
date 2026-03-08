
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(branch_id, barcode)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Anyone can read products (needed for inventory lookup)
CREATE POLICY "Anyone can read active products"
  ON public.products FOR SELECT
  USING (is_active = true);

-- Mart owners can manage products via branch ownership
CREATE POLICY "Mart owners can manage products"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = products.branch_id
      AND is_mart_owner(auth.uid(), b.mart_id)
    )
  );

-- Employees can read all products for their mart
CREATE POLICY "Employees can read products"
  ON public.products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = products.branch_id
      AND is_mart_employee(auth.uid(), b.mart_id)
    )
  );
