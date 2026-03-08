import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!RAZORPAY_KEY_SECRET) throw new Error("Razorpay secret not configured");

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, session_id } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !session_id) {
      throw new Error("Missing required fields");
    }

    // Verify signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const key = new TextEncoder().encode(RAZORPAY_KEY_SECRET);
    const data = new TextEncoder().encode(body);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const expectedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSignature !== razorpay_signature) {
      throw new Error("Invalid payment signature");
    }

    // Payment verified — update records
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update payment
    await supabase.from("payments").update({
      status: "completed",
      razorpay_payment_id,
      paid_at: new Date().toISOString(),
    }).eq("razorpay_order_id", razorpay_order_id);

    // Get session details for invoice
    const { data: session } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (session) {
      // Get cart items
      const { data: items } = await supabase
        .from("cart_items")
        .select("*")
        .eq("session_id", session_id);

      const cartItems = items || [];
      const totalQty = cartItems.reduce((s: number, i: any) => s + i.quantity, 0);

      // Generate invoice
      await supabase.from("invoices").insert({
        session_id,
        mart_id: session.mart_id,
        branch_id: session.branch_id,
        user_id: session.user_id,
        invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
        items: cartItems,
        total_amount: session.total_amount,
        total_quantity: totalQty,
        payment_method: "razorpay",
      });

      // Update session to PAID
      await supabase.from("sessions").update({
        state: "PAID",
        payment_method: "razorpay",
      }).eq("id", session_id);

      // Audit log
      await supabase.from("audit_logs").insert({
        action: "RAZORPAY_PAYMENT_VERIFIED",
        user_id: session.user_id,
        session_id,
        details: { razorpay_payment_id, razorpay_order_id, amount: session.total_amount },
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
