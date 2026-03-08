import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay keys not configured");
    }

    const { session_id, amount } = await req.json();
    if (!session_id || !amount) {
      throw new Error("session_id and amount are required");
    }

    // Verify session exists and is in VERIFIED state
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: session, error: sessErr } = await supabase
      .from("sessions")
      .select("id, state, total_amount")
      .eq("id", session_id)
      .single();

    if (sessErr || !session) {
      throw new Error("Session not found");
    }
    if (session.state !== "VERIFIED") {
      throw new Error(`Cannot create order: session state is ${session.state}`);
    }

    // Create Razorpay order
    const amountPaise = Math.round(amount * 100);
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `receipt_${session_id.substring(0, 8)}`,
        notes: { session_id },
      }),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      throw new Error(`Razorpay error: ${errText}`);
    }

    const order = await orderRes.json();

    // Store payment record
    await supabase.from("payments").insert({
      session_id,
      amount,
      method: "razorpay",
      status: "pending",
      razorpay_order_id: order.id,
    });

    return new Response(
      JSON.stringify({
        order_id: order.id,
        amount: amountPaise,
        currency: "INR",
        key_id: RAZORPAY_KEY_ID,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
