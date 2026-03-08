export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          branch_name: string
          created_at: string
          id: string
          inventory_api_url: string | null
          is_default: boolean
          mart_id: string
        }
        Insert: {
          address?: string | null
          branch_name: string
          created_at?: string
          id?: string
          inventory_api_url?: string | null
          is_default?: boolean
          mart_id: string
        }
        Update: {
          address?: string | null
          branch_name?: string
          created_at?: string
          id?: string
          inventory_api_url?: string | null
          is_default?: boolean
          mart_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_mart_id_fkey"
            columns: ["mart_id"]
            isOneToOne: false
            referencedRelation: "marts"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_at: string
          barcode: string
          brand: string | null
          category: string | null
          id: string
          image_url: string | null
          price: number
          quantity: number
          session_id: string
          title: string
        }
        Insert: {
          added_at?: string
          barcode: string
          brand?: string | null
          category?: string | null
          id?: string
          image_url?: string | null
          price: number
          quantity?: number
          session_id: string
          title: string
        }
        Update: {
          added_at?: string
          barcode?: string
          brand?: string | null
          category?: string | null
          id?: string
          image_url?: string | null
          price?: number
          quantity?: number
          session_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          branch_id: string | null
          created_at: string
          employee_name: string
          id: string
          is_active: boolean
          mart_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          employee_name: string
          id?: string
          is_active?: boolean
          mart_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          employee_name?: string
          id?: string
          is_active?: boolean
          mart_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_mart_id_fkey"
            columns: ["mart_id"]
            isOneToOne: false
            referencedRelation: "marts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          invoice_number: string
          items: Json
          mart_id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          session_id: string
          total_amount: number
          total_quantity: number
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          invoice_number: string
          items?: Json
          mart_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          session_id: string
          total_amount?: number
          total_quantity?: number
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          invoice_number?: string
          items?: Json
          mart_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          session_id?: string
          total_amount?: number
          total_quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_mart_id_fkey"
            columns: ["mart_id"]
            isOneToOne: false
            referencedRelation: "marts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      marts: {
        Row: {
          config: Json
          created_at: string
          customer_pay_from_app: boolean
          id: string
          logo_url: string | null
          merchant_name: string | null
          name: string
          owner_id: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          customer_pay_from_app?: boolean
          id?: string
          logo_url?: string | null
          merchant_name?: string | null
          name: string
          owner_id: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          customer_pay_from_app?: boolean
          id?: string
          logo_url?: string | null
          merchant_name?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          session_id: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          session_id: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string
          branch_id: string
          brand: string | null
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          price: number
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          barcode: string
          branch_id: string
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          price?: number
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          branch_id?: string
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          price?: number
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          branch_id: string
          cart_hash: string | null
          created_at: string
          id: string
          mart_id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          session_code: string
          state: Database["public"]["Enums"]["cart_state"]
          total_amount: number
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          branch_id: string
          cart_hash?: string | null
          created_at?: string
          id?: string
          mart_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          session_code: string
          state?: Database["public"]["Enums"]["cart_state"]
          total_amount?: number
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          branch_id?: string
          cart_hash?: string | null
          created_at?: string
          id?: string
          mart_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          session_code?: string
          state?: Database["public"]["Enums"]["cart_state"]
          total_amount?: number
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_mart_id_fkey"
            columns: ["mart_id"]
            isOneToOne: false
            referencedRelation: "marts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_mart_employee: {
        Args: { _mart_id: string; _user_id: string }
        Returns: boolean
      }
      is_mart_owner: {
        Args: { _mart_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "customer" | "cashier" | "admin"
      cart_state:
        | "CREATED"
        | "ACTIVE"
        | "LOCKED"
        | "VERIFIED"
        | "PAID"
        | "CLOSED"
      payment_method: "cash" | "card" | "upi_counter" | "upi_app" | "razorpay"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "cashier", "admin"],
      cart_state: ["CREATED", "ACTIVE", "LOCKED", "VERIFIED", "PAID", "CLOSED"],
      payment_method: ["cash", "card", "upi_counter", "upi_app", "razorpay"],
    },
  },
} as const
