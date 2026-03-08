import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const email = "admin@ecart-test.com";
  const password = "Admin@12345";

  // Create user
  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Test Admin" },
  });

  if (userErr) return new Response(JSON.stringify({ error: userErr.message }), { status: 400 });

  const userId = userData.user.id;

  // Add admin role
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });

  // Create a mart for this admin
  const { data: mart } = await supabaseAdmin.from("marts").insert({
    name: "Test Mart",
    owner_id: userId,
    config: {},
  }).select().single();

  // Create default branch
  if (mart) {
    await supabaseAdmin.from("branches").insert({
      mart_id: mart.id,
      branch_name: "Main Branch",
      is_default: true,
    });
  }

  return new Response(JSON.stringify({ success: true, userId, email, password }), {
    headers: { "Content-Type": "application/json" },
  });
});
