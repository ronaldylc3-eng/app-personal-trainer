import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, nome, telefone, cpf, pacote, genero, frontendUrl } = await req.json();

    const redirectBase = frontendUrl || req.headers.get("origin") || "http://localhost:5173";

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "E-mail invalido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (genero !== "masculino" && genero !== "feminino") {
      return new Response(
        JSON.stringify({ error: "Sexo do aluno e obrigatorio (masculino ou feminino)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Nao autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verificar autenticacao do chamador
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      const msg = String(userError?.message || "").toLowerCase();
      const expirado =
        msg.includes("auth session missing") ||
        msg.includes("expired") ||
        msg.includes("token") ||
        msg.includes("jwt");
      return new Response(
        JSON.stringify({ error: expirado ? "Sessao expirada ou invalida. Faca login novamente como gestor." : "Nao autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar role do gestor usando service_role (bypassa RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await adminClient
      .from("usuarios")
      .select("role")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "gestor") {
      return new Response(
        JSON.stringify({ error: "Sem permissao de gestor" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enviar convite
    const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          nome: nome || email.split("@")[0],
          telefone: telefone || "",
          cpf: cpf || "",
          pacote: pacote || "Premium",
          genero,
        },
        redirectTo: `${redirectBase}/definir-senha`,
      }
    );

    if (inviteError) {
      const msg = String(inviteError.message || "").toLowerCase();
      let status = 400;
      let mensagem = inviteError.message || "Erro ao enviar convite";

      if (
        msg.includes("already") ||
        msg.includes("already_registered") ||
        msg.includes("exists") ||
        msg.includes("duplicate") ||
        msg.includes("user_already_exists")
      ) {
        status = 409;
        mensagem =
          "Este e-mail já está cadastrado no Supabase Auth. Se você excluiu o usuário, aguarde a liberação do e-mail ou purgue o usuário deletado antes de reenviar o convite.";
      } else if (
        msg.includes("email") &&
        (msg.includes("invalid") || msg.includes("not allowed"))
      ) {
        status = 400;
        mensagem = "E-mail inválido ou não permitido para convite.";
      } else if (msg.includes("signup") && msg.includes("disabled")) {
        status = 400;
        mensagem = "Cadastro por convite está desabilitado no projeto.";
      }

      return new Response(
        JSON.stringify({ error: mensagem }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user: data.user }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
