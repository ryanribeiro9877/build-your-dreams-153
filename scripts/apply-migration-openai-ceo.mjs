/**
 * Aplica a migração 20260525000000_openai_models_catalog_and_ceo_prompt.sql
 * via Supabase service role (upsert model_pricing + update CEO system_prompt).
 *
 * Uso: node scripts/apply-migration-openai-ceo.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    let text = readFileSync(p, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

const CEO_PROMPT = `Você é o CEO LexForce, o agente que comanda toda a operação jurídica do escritório.

PRINCÍPIOS:
- Você NÃO é um chatbot genérico. Você é o moderador e orquestrador de uma força de trabalho de IA jurídica.
- Toda solicitação do usuário chega primeiro a você. Você decide se responde direto ou se delega.
- Sempre fale em primeira pessoa como "CEO LexForce" (não "OpenAI", "ChatGPT" etc.).
- Tom: profissional, direto, sem floreios. Português do Brasil.

QUANDO RESPONDER DIRETO:
- Perguntas estratégicas sobre o escritório, prioridades, decisões executivas.
- Resumos consolidados de operação.
- Esclarecimentos sobre quem faz o quê na hierarquia.
- Saudações e perguntas curtas ("oi", "tudo bem", "quem é você").

QUANDO DELEGAR (informe explicitamente ao usuário):
- Petição inicial / contestação / recurso → "Vou pedir para o Redator de Petições preparar isso."
- Cálculo de rescisão / liquidação / juros → "Vou acionar o Ger. de Cálculos."
- Pesquisa de jurisprudência ou consulta processual → "O Ger. Consulta Processual cuida disso."
- Marcar audiência / confirmar audiência → "Confirmação de Audiências vai resolver."
- Triagem de cliente novo / qualificação → "Agente de Triagem assume."
- Cobrança / contas a receber → "Ger. de Cobranças vai entrar em contato."
- Compliance / LGPD → "Ger. de Compliance valida."
- Marketing / conteúdo → "Diretor de Marketing dispara."

FORMATO DAS DELEGAÇÕES:
Quando delegar, use o padrão:
  "Anotado. Vou delegar isso para [AGENTE]. [breve explicação do que ele vai fazer]. Te aviso quando estiver pronto pra sua revisão."

CONTROLE FINAL:
- Você nunca promete prazo sem confirmar.
- Nunca protocola, envia e-mail ou fecha acordo sozinho — sempre devolve pro humano aprovar.
- Se a solicitação for inviável (fora do escopo jurídico, ilegal, antiética), recuse com clareza.

Pronto. Aguardo o usuário.`;

const OPENAI_MODELS = [
  ["gpt-5.5", "GPT-5.5 · flagship", "flagship", 5.0, 30.0, 1000000, 16384, true],
  ["gpt-5.5-pro", "GPT-5.5 Pro · max quality", "flagship", 30.0, 180.0, 1000000, 16384, true],
  ["gpt-5.4", "GPT-5.4 · flagship", "flagship", 2.5, 15.0, 400000, 16384, true],
  ["gpt-5.4-pro", "GPT-5.4 Pro · max quality", "flagship", 30.0, 180.0, 400000, 16384, true],
  ["gpt-5.4-mini", "GPT-5.4 mini · balanced", "balanced", 0.75, 4.5, 400000, 8192, true],
  ["gpt-5.4-nano", "GPT-5.4 nano · ultra-cheap", "fast", 0.2, 1.25, 128000, 4096, true],
  ["gpt-5.3-codex", "GPT-5.3 Codex · code", "balanced", 1.75, 14.0, 256000, 8192, true],
  ["gpt-5.2", "GPT-5.2 · balanced", "balanced", 1.75, 14.0, 256000, 8192, true],
  ["gpt-5.2-codex", "GPT-5.2 Codex · code", "balanced", 1.75, 14.0, 256000, 8192, true],
  ["gpt-5.2-pro", "GPT-5.2 Pro · max quality", "flagship", 21.0, 168.0, 256000, 8192, true],
  ["gpt-5.1", "GPT-5.1 · balanced", "balanced", 1.25, 10.0, 256000, 8192, true],
  ["gpt-5.1-codex", "GPT-5.1 Codex · code", "balanced", 1.25, 10.0, 256000, 8192, true],
  ["gpt-5.1-codex-max", "GPT-5.1 Codex Max · code", "flagship", 1.25, 10.0, 256000, 8192, true],
  ["gpt-5", "GPT-5 · balanced", "balanced", 1.25, 10.0, 256000, 8192, true],
  ["gpt-5-codex", "GPT-5 Codex · code", "balanced", 1.25, 10.0, 256000, 8192, true],
  ["gpt-5-mini", "GPT-5 mini · fast", "fast", 0.25, 2.0, 128000, 8192, true],
  ["gpt-5-nano", "GPT-5 nano · ultra-cheap", "fast", 0.05, 0.4, 128000, 4096, true],
  ["gpt-5-pro", "GPT-5 Pro · max quality", "flagship", 15.0, 120.0, 256000, 8192, true],
  ["o4-mini", "o4-mini · reasoning fast", "reasoning", 1.1, 4.4, 200000, 16384, true],
  ["o4-mini-deep-research", "o4-mini deep research", "reasoning", 2.0, 8.0, 200000, 16384, true],
  ["o3", "o3 · reasoning", "reasoning", 2.0, 8.0, 200000, 16384, true],
  ["o3-mini", "o3-mini · reasoning fast", "reasoning", 1.1, 4.4, 200000, 16384, true],
  ["o3-pro", "o3 Pro · max reasoning", "reasoning", 20.0, 80.0, 200000, 16384, true],
  ["o3-deep-research", "o3 deep research", "reasoning", 10.0, 40.0, 200000, 16384, true],
  ["o1", "o1 · reasoning", "reasoning", 15.0, 60.0, 200000, 4096, false],
  ["o1-mini", "o1-mini · reasoning fast", "reasoning", 1.1, 4.4, 128000, 4096, false],
  ["o1-pro", "o1 Pro · max reasoning", "reasoning", 150.0, 600.0, 200000, 8192, false],
  ["gpt-4.1", "GPT-4.1 · long context", "balanced", 2.0, 8.0, 1000000, 8192, true],
  ["gpt-4.1-mini", "GPT-4.1 mini · long ctx", "fast", 0.4, 1.6, 1000000, 8192, true],
  ["gpt-4.1-nano", "GPT-4.1 nano · cheapest", "fast", 0.1, 0.4, 128000, 4096, true],
  ["gpt-4o", "GPT-4o · multimodal", "balanced", 2.5, 10.0, 128000, 4096, true],
  ["gpt-4o-mini", "GPT-4o mini · fast", "fast", 0.15, 0.6, 128000, 16384, true],
].map(
  ([model_id, display_name, tier, input_price_per_mtok, output_price_per_mtok, context_window, max_output_tokens, supports_tools]) => ({
    provider: "openai",
    model_id,
    display_name,
    tier,
    input_price_per_mtok,
    output_price_per_mtok,
    context_window,
    max_output_tokens,
    supports_tools,
    is_active: true,
  }),
);

loadDotEnv();

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

async function main() {
  if (!url || !serviceRole) {
    throw new Error("Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("1/2 — Upsert catálogo OpenAI em model_pricing (%d modelos)...", OPENAI_MODELS.length);
  const { error: upsertErr } = await admin.from("model_pricing").upsert(OPENAI_MODELS, {
    onConflict: "provider,model_id",
  });
  if (upsertErr) {
    throw new Error(`model_pricing upsert: ${upsertErr.message}`);
  }
  console.log("   OK — modelos OpenAI sincronizados.");

  console.log("2/2 — Atualizando system_prompt do CEO LexForce...");
  const { data: agents, error: listErr } = await admin
    .from("agents")
    .select("id, name, role");
  if (listErr) throw new Error(`agents list: ${listErr.message}`);

  const ceoAgents = (agents || []).filter(
    (a) =>
      String(a.role || "").toLowerCase() === "ceo" ||
      String(a.name || "").toLowerCase().startsWith("ceo lexforce"),
  );

  if (ceoAgents.length === 0) {
    console.warn("   AVISO: nenhum agente CEO encontrado — prompt não aplicado.");
  } else {
    for (const a of ceoAgents) {
      const { error: updErr } = await admin
        .from("agents")
        .update({ system_prompt: CEO_PROMPT })
        .eq("id", a.id);
      if (updErr) throw new Error(`agents update ${a.name}: ${updErr.message}`);
      console.log("   OK — %s (%s)", a.name, a.id);
    }
  }

  const { count } = await admin
    .from("model_pricing")
    .select("id", { count: "exact", head: true })
    .eq("provider", "openai")
    .eq("is_active", true);

  console.log("\nMigração concluída. Modelos OpenAI ativos no banco: %s", count ?? "?");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
