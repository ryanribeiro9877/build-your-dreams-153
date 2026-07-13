/**
 * Card 7.1 — Seed idempotente de boards de Kanban por tipo de ação.
 *
 * Provisiona UMA board por tipo de ação (jurídica), cada uma com o template de
 * 5 colunas verificado em produção, e grava `kanban_boards.tipo_acao`.
 *
 * PRÉ-REQUISITOS (ver docs/superpowers/specs/2026-07-13-card-7.1-kanban-tipado-design.md):
 *   1. Lista validada por Ryan + Rodrigo (constante TIPOS abaixo).
 *   2. Migration aplicada: `kanban_boards.tipo_acao text` + índice único parcial.
 *   3. .env(.local) com VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 *
 * Faz inserts DIRETOS por service role (bypass RLS) porque as RPCs
 * kanban_create_board/kanban_set_columns exigem kanban_can_admin(auth.uid()),
 * que é NULL sob service role. Os inserts replicam fielmente o template.
 *
 * SEGURANÇA: por padrão roda em DRY-RUN (só imprime o plano). Para gravar de
 * verdade: SEED_CONFIRM=apply node scripts/seed-kanban-type-boards.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// LISTA VALIDADA (Ryan + Rodrigo). `existing` = board que só recebe o tipo.
// Trabalhista está comentado até a decisão (não existe em legal_area).
// ---------------------------------------------------------------------------
const TIPOS = [
  { tipo_acao: "bancario", name: "Ações Bancárias", existing: "Ações Bancárias", sort_order: 100 },
  { tipo_acao: "previdenciario", name: "Ações Previdenciárias", sort_order: 110 },
  { tipo_acao: "civil", name: "Ações Cíveis", sort_order: 120 },
  { tipo_acao: "consumidor", name: "Ações do Consumidor", sort_order: 130 },
  { tipo_acao: "familia", name: "Ações de Família", sort_order: 140 },
  { tipo_acao: "plano_saude", name: "Ações de Plano de Saúde", sort_order: 150 },
  { tipo_acao: "tributario", name: "Ações Tributárias", sort_order: 160 },
  // { tipo_acao: "trabalhista", name: "Ações Trabalhistas", sort_order: 170 },
];

// Template de 5 colunas (verificado em produção na board "Ações Bancárias").
const COLUNAS = [
  { name: "Pendente", situacao: "pendente", position: 0 },
  { name: "Em execução", situacao: "em_execucao", position: 1 },
  { name: "Concluída (sucesso)", situacao: "concluida_sucesso", position: 2 },
  { name: "Concluída (sem sucesso)", situacao: "concluida_sem_sucesso", position: 3 },
  { name: "Cancelada", situacao: "cancelado", position: 4 },
];

const APPLY = (process.env.SEED_CONFIRM || "").trim() === "apply";
const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function log(...a) { console.log(...a); }

async function main() {
  if (!url || !key) throw new Error("Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env(.local).");
  if (!TIPOS.length) throw new Error("Lista TIPOS vazia — preencha com a lista validada antes de rodar.");

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "seed-kanban-type-boards" } },
  });

  // Pré-requisito 2: a coluna tipo_acao precisa existir (senão a migration não foi aplicada).
  const probe = await admin.from("kanban_boards").select("id,tipo_acao").limit(1);
  if (probe.error) {
    throw new Error(
      `Não consegui ler kanban_boards.tipo_acao — a migration 7.1 foi aplicada? Detalhe: ${probe.error.message}`
    );
  }

  // Owner das novas boards = dono de uma board existente (sócio).
  const ownerRes = await admin
    .from("kanban_boards")
    .select("owner_user_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ownerUserId = ownerRes.data?.owner_user_id;
  if (!ownerUserId) throw new Error("Não encontrei owner_user_id de referência (nenhuma board existente).");

  log(`Modo: ${APPLY ? "APPLY (grava)" : "DRY-RUN (só plano; use SEED_CONFIRM=apply para gravar)"}`);
  log(`Owner das novas boards: ${ownerUserId}\n`);

  for (const t of TIPOS) {
    // idempotência: já existe board com este tipo_acao?
    const byType = await admin.from("kanban_boards").select("id,name").eq("tipo_acao", t.tipo_acao).maybeSingle();
    if (byType.data) {
      log(`= ${t.tipo_acao}: já tipada (board "${byType.data.name}") — skip`);
      continue;
    }

    // caso "existing": board já existe por nome, só gravar o tipo
    if (t.existing) {
      const ex = await admin.from("kanban_boards").select("id,name,tipo_acao").eq("name", t.existing).maybeSingle();
      if (ex.data) {
        log(`~ ${t.tipo_acao}: gravar tipo_acao na board existente "${ex.data.name}" (${ex.data.id})`);
        if (APPLY) {
          const upd = await admin.from("kanban_boards").update({ tipo_acao: t.tipo_acao }).eq("id", ex.data.id);
          if (upd.error) throw new Error(`Falha ao tipar "${ex.data.name}": ${upd.error.message}`);
        }
        continue;
      }
    }

    // criar board nova + 5 colunas
    log(`+ ${t.tipo_acao}: criar board "${t.name}" + ${COLUNAS.length} colunas`);
    if (!APPLY) continue;

    const ins = await admin
      .from("kanban_boards")
      .insert({
        name: t.name,
        owner_user_id: ownerUserId,
        is_private: false, // board compartilhada (D-3)
        tipo_acao: t.tipo_acao,
        sort_order: t.sort_order ?? 100,
      })
      .select("id")
      .single();
    if (ins.error) throw new Error(`Falha ao criar board "${t.name}": ${ins.error.message}`);

    const cols = COLUNAS.map((c) => ({ ...c, board_id: ins.data.id }));
    const insCols = await admin.from("kanban_columns").insert(cols);
    if (insCols.error) {
      // rollback best-effort da board órfã
      await admin.from("kanban_boards").delete().eq("id", ins.data.id);
      throw new Error(`Falha ao criar colunas de "${t.name}" (board removida): ${insCols.error.message}`);
    }
  }

  log(`\n${APPLY ? "Seed aplicado." : "Dry-run concluído — nada gravado."}`);
}

main().catch((e) => {
  console.error("ERRO:", e.message || e);
  process.exitCode = 1;
});
