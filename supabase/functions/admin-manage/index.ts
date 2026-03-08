import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, email, password, display_name, role, mart_id, branch_id, admin_user_id } = await req.json();

    if (action === "create_employee") {
      // Verify admin_user_id is actually admin
      const { data: adminCheck } = await supabaseAdmin
        .from("user_roles").select("role")
        .eq("user_id", admin_user_id).eq("role", "admin");
      if (!adminCheck?.length) throw new Error("Not admin");

      // Create user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name },
      });
      if (createError) throw createError;

      const userId = newUser.user.id;

      // Add employee role (trigger already added 'customer')
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });

      // Add employee record
      await supabaseAdmin.from("employees").insert({
        user_id: userId, employee_name: display_name,
        mart_id, branch_id: branch_id || null, is_active: true,
      });

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
