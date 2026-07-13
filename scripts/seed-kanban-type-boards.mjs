/**
 * Card 7.1 — Seed idempotente de boards de Kanban por tipo de ação (modelo tipos_acao).
 *
 * Para cada linha ATIVA de public.tipos_acao (12 hoje), cria UMA board de Kanban
 * (nome = tipos_acao.nome) via a RPC kanban_create_board — que JÁ cria o template
 * de 5 colunas — e liga a board ao tipo gravando kanban_boards.tipo_acao_id.
 *
 * ── Descobertas que moldam este script (verificadas em produção 2026-07-13) ──
 *  • kanban_create_board / kanban_set_columns são SECURITY DEFINER mas EXIGEM
 *    auth.uid() != NULL + kanban_can_admin(uid). Service role puro (auth.uid()=NULL)
 *    dispara "não autenticado". Por isso o script AUTENTICA como usuário admin
 *    (SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD) para chamar as RPCs, e usa a service role
 *    só para ler tipos_acao e gravar o vínculo tipo_acao_id (bypass RLS, confiável).
 *  • kanban_create_board JÁ insere as 5 colunas do template
 *    (Pendente/pendente, Em execução/em_execucao, Concluída sucesso/concluida_sucesso,
 *     Concluída sem sucesso/concluida_sem_sucesso, Cancelada/cancelado — enum task_situacao).
 *    Logo NÃO chamamos kanban_set_columns (seria redundante e faria churn).
 *  • A board "Ações Bancárias" existente tem tipo_acao_id NULL e nome que não colide
 *    com nenhum tipos_acao.nome → o seed nunca a duplica nem a altera (decisão do Ryan).
 *
 * IDEMPOTÊNCIA: pula tipo cujo id já apareça em kanban_boards.tipo_acao_id; se existir
 * board com o mesmo nome porém sem vínculo (rerun após falha parcial), apenas religa.
 *
 * SEGURANÇA: DRY-RUN por padrão (só imprime o plano). Grava só com:
 *   SEED_CONFIRM=apply node scripts/seed-kanban-type-boards.mjs
 *
 * ENV (.env / .env.local):
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   VITE_SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY),
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD  (usuário com role admin)
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

const APPLY = (process.env.SEED_CONFIRM || "").trim() === "apply";
const BOARDS_PRIVATE = (process.env.SEED_BOARDS_PRIVATE || "").trim() === "true"; // default: compartilhadas

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();
const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

function log(...a) {
  console.log(...a);
}

async function main() {
  if (!url || !serviceRole) {
    throw new Error("Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env(.local).");
  }

  // Cliente service role: leituras + gravação do vínculo tipo_acao_id (bypass RLS).
  const svc = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "seed-kanban-type-boards(svc)" } },
  });

  // 1) tipos de ação ativos
  const tiposRes = await svc
    .from("tipos_acao")
    .select("id,code,nome,ativo,sort_order")
    .eq("ativo", true)
    .order("sort_order", { ascending: true });
  if (tiposRes.error) throw new Error(`Falha ao ler tipos_acao: ${tiposRes.error.message}`);
  const tipos = tiposRes.data || [];
  if (!tipos.length) throw new Error("Nenhum tipo_acao ativo encontrado — nada a semear.");
  log(`tipos_acao ativos: ${tipos.length}`);

  // 2) estado atual das boards (idempotência)
  const boardsRes = await svc.from("kanban_boards").select("id,name,tipo_acao_id");
  if (boardsRes.error) {
    throw new Error(
      `Falha ao ler kanban_boards (a migration tipo_acao_id foi aplicada?): ${boardsRes.error.message}`
    );
  }
  const boards = boardsRes.data || [];
  const linkedTipoIds = new Set(boards.filter((b) => b.tipo_acao_id).map((b) => b.tipo_acao_id));
  const byName = new Map(boards.map((b) => [b.name, b]));

  // 3) cliente autenticado como admin (necessário para as RPCs kanban_*)
  //    Só criamos/logamos quando for realmente gravar E houver tipo novo a criar.
  let userClient = null;
  async function ensureAdminClient() {
    if (userClient) return userClient;
    if (!anonKey) throw new Error("Defina VITE_SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) para autenticar o admin.");
    if (!adminEmail || !adminPassword) {
      throw new Error(
        "kanban_create_board exige usuário admin: defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (usuário com role admin)."
      );
    }
    const c = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "seed-kanban-type-boards(admin)" } },
    });
    const { error } = await c.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    if (error) throw new Error(`Falha ao autenticar SEED_ADMIN_EMAIL: ${error.message}`);
    userClient = c;
    return c;
  }

  log(`Modo: ${APPLY ? "APPLY (grava)" : "DRY-RUN (só plano; use SEED_CONFIRM=apply para gravar)"}`);
  log(`Boards: ${BOARDS_PRIVATE ? "privadas" : "compartilhadas (is_private=false)"}\n`);

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const t of tipos) {
    // (a) já ligada a este tipo → skip
    if (linkedTipoIds.has(t.id)) {
      log(`= ${t.code}: já tem board (tipo_acao_id ${t.id}) — skip`);
      skipped++;
      continue;
    }

    // (b) board com o mesmo nome porém sem vínculo (rerun após falha parcial) → só religa
    const existing = byName.get(t.nome);
    if (existing && !existing.tipo_acao_id) {
      log(`~ ${t.code}: board "${t.nome}" existe sem vínculo → religar tipo_acao_id`);
      if (APPLY) {
        const upd = await svc.from("kanban_boards").update({ tipo_acao_id: t.id }).eq("id", existing.id);
        if (upd.error) throw new Error(`Falha ao religar "${t.nome}": ${upd.error.message}`);
        linkedTipoIds.add(t.id);
      }
      linked++;
      continue;
    }

    // (c) criar board via RPC (cria board + 5 colunas do template) e ligar ao tipo
    log(`+ ${t.code}: criar board "${t.nome}" (via kanban_create_board) + vincular`);
    if (!APPLY) {
      created++;
      continue;
    }

    const admin = await ensureAdminClient();
    const rpc = await admin.rpc("kanban_create_board", {
      p_name: t.nome,
      p_is_private: BOARDS_PRIVATE,
    });
    if (rpc.error) throw new Error(`kanban_create_board falhou para "${t.nome}": ${rpc.error.message}`);
    const boardId = rpc.data; // retorna uuid da board

    const link = await svc.from("kanban_boards").update({ tipo_acao_id: t.id }).eq("id", boardId);
    if (link.error) {
      throw new Error(
        `Board "${t.nome}" criada (${boardId}) mas FALHOU ao vincular tipo_acao_id: ${link.error.message}. ` +
          `Rode de novo: o script religa pelo nome.`
      );
    }
    linkedTipoIds.add(t.id);
    created++;
  }

  log(`\nResumo: criar=${created} religar=${linked} skip=${skipped}`);
  log(APPLY ? "Seed aplicado." : "Dry-run concluído — nada gravado.");
}

main().catch((e) => {
  console.error("ERRO:", e.message || e);
  process.exitCode = 1;
});
