// supabase/functions/gerar-kit-documental/index.ts
//
// Onda 2.3 — geração SERVER-SIDE do kit documental do cooperado (procuração,
// contrato de honorários, declaração de hipossuficiência, ficha cadastral).
// Porte da engine client-side (JSZip + templates) para o edge, para que a mesma
// geração da tela seja disparável pelo chat.
//
// Autorização = a MESMA da tela: TODAS as operações (ler clients_decrypted,
// upload no Storage, insert em client_documents) correm sob o JWT do usuário
// (RLS). O edge não usa service-role para nada — o chat não pode mais que o
// usuário. Quem não enxerga o cliente na tela recebe "não encontrado" aqui.
//
// verify_jwt = true (config.toml): a plataforma valida o token antes de entrar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { generateCooperadoDocuments } from "./generate.ts";
import type { CooperadoClientData } from "./cooperadoDocs.ts";

// Colunas do cadastro necessárias aos 4 documentos, lidas da view DECIFRADA.
const DECRYPTED_COLS =
  "id, full_name, cpf, cnpj, rg, rg_issuer, rg_uf, nationality, marital_status, " +
  "profession, birth_date, email, phone, zip_code, address, address_number, " +
  "address_complement, neighborhood, city, state";

serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { ok: false, error: "não autenticado" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // TODAS as operações sob o JWT do usuário → herda a RLS da tela.
    const db = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return json(401, { ok: false, error: "sessão inválida" });

    let body: { client_id?: string };
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const clientId = String(body.client_id ?? "").trim();
    if (!clientId) return json(400, { ok: false, error: "client_id é obrigatório" });

    // Gate: lê o cliente pela via DECIFRADA sob o JWT do usuário. Se a RLS não
    // permitir (usuário não enxerga o cliente), volta vazio → 404.
    const { data: client, error: cliErr } = await db
      .from("clients_decrypted")
      .select(DECRYPTED_COLS)
      .eq("id", clientId)
      .maybeSingle();
    if (cliErr) return json(403, { ok: false, error: "sem acesso ao cliente" });
    if (!client) return json(404, { ok: false, error: "cliente não encontrado (ou sem acesso)" });

    const c = client as unknown as CooperadoClientData;
    const templatesBaseUrl =
      Deno.env.get("TEMPLATES_BASE_URL") || "https://advjurisai.com.br/templates";

    const generated = await generateCooperadoDocuments(db, templatesBaseUrl, c, user.id, {
      clientName: c.full_name ?? undefined,
    });

    const geradosAgora = generated.filter((g) => g.ok && !g.alreadyExisted).length;
    const jaExistiam = generated.filter((g) => g.ok && g.alreadyExisted).length;
    const falhas = generated.filter((g) => !g.ok);

    return json(200, {
      ok: falhas.length === 0,
      cliente: c.full_name ?? null,
      gerados: geradosAgora,
      ja_existiam: jaExistiam,
      falhas: falhas.map((f) => ({ documento: f.label, erro: f.error })),
      documentos: generated,
    });
  } catch (e) {
    return json(500, { ok: false, error: (e as Error)?.message ?? "erro interno" });
  }
});
