import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const testUsers = [
    { email: "diretor@teste.com", name: "Dr. Carlos Diretor", role: "director" },
    { email: "gerente@teste.com", name: "Ana Gerente", role: "manager" },
    { email: "advogado@teste.com", name: "Dr. Pedro Advogado", role: "lawyer" },
    { email: "recepcionista@teste.com", name: "Maria Recepção", role: "receptionist" },
    { email: "estagiario@teste.com", name: "João Estagiário", role: "intern" },
    { email: "protocolo@teste.com", name: "Lucia Protocolo", role: "protocol" },
    { email: "financeiro@teste.com", name: "Roberto Financeiro", role: "financial" },
    { email: "marketing@teste.com", name: "Camila Marketing", role: "marketing" },
  ];

  const results = [];

  for (const u of testUsers) {
    // Create user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: u.email,
      password: "Teste123!",
      email_confirm: true,
      user_metadata: { display_name: u.name },
    });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        // Get existing user
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find((x: any) => x.email === u.email);
        if (existing) {
          // Ensure role exists
          await supabaseAdmin.from("user_roles").upsert(
            { user_id: existing.id, role: u.role },
            { onConflict: "user_id,role" }
          );
          results.push({ email: u.email, status: "already_exists", role: u.role });
        }
      } else {
        results.push({ email: u.email, status: "error", error: authError.message });
      }
      continue;
    }

    const userId = authData.user!.id;

    // Assign role
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: u.role });

    results.push({ email: u.email, status: "created", role: u.role });
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
