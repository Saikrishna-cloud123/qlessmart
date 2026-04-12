// TypeScript types mapping to Firestore collections for QLessMart

export type AppRole = 'customer' | 'cashier' | 'admin' | 'exit_guard';
export type CartState = 'CREATED' | 'ACTIVE' | 'LOCKED' | 'VERIFIED' | 'PAID' | 'CLOSED';
export type PaymentMethod = 'cash' | 'card' | 'upi_counter' | 'upi_app' | 'razorpay';

export interface Profile {
  id: string; // Document ID (matches auth.uid)
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string; // Document ID
  user_id: string; 
  role: AppRole;
}

export interface Mart {
  id: string; // Document ID
  name: string;
  owner_id: string;
  config: Record<string, any>;
  logo_url: string | null;
  customer_pay_from_app: boolean;
  upi_id: string | null;
  merchant_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string; // Document ID
  mart_id: string;
  branch_name: string;
  inventory_api_url: string | null;
  is_default: boolean;
  address: string | null;
  created_at: string;
}

export interface Employee {
  id: string; // Document ID
  user_id: string;
  mart_id: string;
  branch_id: string | null;
  employee_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Session {
  id: string; // Document ID
  session_code: string;
  user_id: string;
  mart_id: string;
  branch_id: string;
  state: CartState;
  cart_hash: string | null;
  payment_method: PaymentMethod | null;
  verified_by: string | null;
  verified_at: string | null;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string; // Document ID
  session_id: string;
  barcode: string;
  title: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  price: number;
  quantity: number;
  added_at: string;
}

export interface Payment {
  id: string; // Document ID
  session_id: string;
  amount: number;
  method: PaymentMethod;
  status: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Invoice {
  id: string; // Document ID
  session_id: string;
  mart_id: string;
  branch_id: string;
  user_id: string;
  invoice_number: string;
  items: CartItem[]; // Stored as array
  total_quantity: number;
  total_amount: number;
  payment_method: PaymentMethod | null;
  created_at: string;
}

export interface AuditLog {
  id: string; // Document ID
  session_id: string | null;
  user_id: string | null;
  action: string;
  details: Record<string, any>;
  created_at: string;
}

export interface Product {
  id: string; // Document ID
  branch_id: string;
  barcode: string;
  title: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
