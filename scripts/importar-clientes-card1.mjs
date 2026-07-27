#!/usr/bin/env node
// ============================================================================
// CARD 1 — importação em massa dos clientes das planilhas
// ============================================================================
// Lê os .xlsx e chama a RPC `importar_clientes_planilha` em lotes. A REGRA DE
// NEGÓCIO É DO BANCO (idempotência, enriquecimento, nível mais alto, cofre da
// credencial, upsert de relações) — este script só extrai, normaliza e envia.
//
// SEGURANÇA (por que script e não migração/SQL):
//   · as planilhas trazem centenas de senhas do GOV.BR. Elas vão da planilha DIRETO
//     para a RPC, que grava no cofre cifrado (save_gov_credential). Não existe
//     artefato intermediário com credencial: nada de CSV/JSON de apoio, nada em log,
//     nada no relatório de erros.
//   · NUNCA commitar as planilhas no repositório.
//   · o login do operador vem de variáveis de ambiente — o script não pede, não
//     imprime e não grava senha de usuário.
//
// FONTES:
//   · o arquivo DRY-RUN (CARD1-DRYRUN-IMPORTACAO-CLIENTES.xlsx) é a fonte dos
//     METADADOS já consolidados e validados (dedup por nome normalizado, CPF com
//     dígito verificador, nível, banco pagador, relações, extrato, flags). Abas
//     usadas: IMPORTAR, SEM_CPF, JA_EXISTEM. A aba CONFLITOS fica de FORA de
//     propósito (3 casos de decisão manual).
//   · as planilhas ORIGINAIS entram apenas para buscar a SENHA de cada cliente
//     (o dry-run só marca "tem senha", proposital), casando por CPF e, na falta,
//     por nome normalizado.
//
// USO:
//   # 1) conferência, sem gravar nada (não precisa de login):
//   node scripts/importar-clientes-card1.mjs --dir "C:/Users/Infosol/Downloads"
//   # 2) piloto de 20 itens (grava):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... IMPORT_USER_EMAIL=... IMPORT_USER_PASSWORD=... \
//     node scripts/importar-clientes-card1.mjs --dir "..." --executar --limit 20
//   # 3) tudo, em lotes de 50:
//   ... --executar --batch 50
// ============================================================================

import { writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readWorkbook } from "./lib/xlsxLite.mjs";
import {
  normalizeName, onlyDigits, formatCpf, parseSenhaCell, parseNivel,
  parseRelacoes, parseExtratoBancos, isSim,
} from "./lib/card1Normalize.mjs";

// ─── argumentos ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const has = (name) => argv.includes(name);

const DIR = arg("--dir", "C:/Users/Infosol/Downloads");
const EXECUTAR = has("--executar");
const LIMIT = Number(arg("--limit", "0")) || 0;
const BATCH = Math.min(Math.max(Number(arg("--batch", "50")) || 50, 1), 100);

// Projeto e chave ANON — ambos PÚBLICOS (a anon key é a que roda no navegador; toda
// a proteção real está na RLS e nos gates das RPCs). Ficam aqui só para o operador
// não precisar procurá-los; podem ser sobrescritos por env.
const SUPABASE_URL_DEFAULT = "https://tsltxvswzdnlmvljpryh.supabase.co";
const SUPABASE_ANON_DEFAULT = "sb_publishable_TXDq-dBuHoB3Wms48i77UA_9AD7SnXN";

// Resolve o arquivo tolerando o sufixo de download duplicado ("… (1).xlsx") e
// variações de espaço/underscore no nome.
function resolveArquivo(dir, nomeExato, prefixo) {
  const exato = path.join(dir, nomeExato);
  if (existsSync(exato)) return exato;
  const alvo = prefixo.replace(/[\s_]+/g, "").toLowerCase();
  const cand = readdirSync(dir)
    .filter((f) => /\.xlsx$/i.test(f) && f.replace(/[\s_]+/g, "").toLowerCase().startsWith(alvo))
    .sort();
  return cand.length ? path.join(dir, cand[0]) : exato;
}

const F_DRYRUN = resolveArquivo(DIR, "CARD1-DRYRUN-IMPORTACAO-CLIENTES.xlsx", "CARD1-DRYRUN");
const F_BANCOS = resolveArquivo(DIR, "Clientes X bancos.xlsx", "Clientes X bancos");
const F_SUSEP = resolveArquivo(DIR, "Dados - Seguro SUSEP.xlsx", "Dados - Seguro SUSEP");

// ─── índice de SENHAS a partir das planilhas originais ──────────────────────
// Cada entrada descreve onde estão nome/CPF/senha (índices 0-based de coluna).
// O nome da aba é casado por PREFIXO normalizado porque o Excel trunca rótulos.
const ABAS_SENHA = [
  { file: F_BANCOS, aba: "Clientes que têm consignados", nome: 0, cpf: 3, senha: 4 },
  { file: F_BANCOS, aba: "RECEBEM NO BRADESCO", nome: 0, cpf: 1, senha: 2 },
  { file: F_BANCOS, aba: "Agi Protege", nome: 0, cpf: 1, senha: 2 },
  { file: F_BANCOS, aba: "HISTÓRICO DE EMPRÉSTIMO", nome: 0, cpf: 1, senha: 2 },
  { file: F_BANCOS, aba: "Relação de clientes e bancos", nome: 0, cpf: 4, senha: 5 },
  { file: F_BANCOS, aba: "Clientes - Pedir contrato", nome: 0, cpf: 2, senha: 3 },
  { file: F_SUSEP, aba: "Facta Financeira e Seguros", nome: 0, cpf: 2, senha: 3 },
  { file: F_SUSEP, aba: "Ouro e Prata - 2 fatores", nome: 0, cpf: 1, senha: 2, forca2fa: true },
  { file: F_SUSEP, aba: "Ouro e Prata c reclamação", nome: 0, cpf: 1, senha: 2 },
  { file: F_SUSEP, aba: "Ouro e Prata s reclamação", nome: 0, cpf: 1, senha: 2 },
  { file: F_SUSEP, aba: "Clientes - Sem senhaincorreta", nome: 0, cpf: 1, senha: 2 },
  { file: F_SUSEP, aba: "Clientes - Bronze", nome: 0, cpf: 1, senha: 2 },
];

/** Índice { porCpf: Map, porNome: Map } → { senha, status, tem2fa, aba }. */
async function construirIndiceSenhas() {
  const porCpf = new Map();
  const porNome = new Map();
  const cache = new Map();
  let lidas = 0;

  for (const cfg of ABAS_SENHA) {
    if (!existsSync(cfg.file)) { console.warn(`  ⚠ arquivo ausente: ${path.basename(cfg.file)}`); continue; }
    if (!cache.has(cfg.file)) cache.set(cfg.file, await readWorkbook(cfg.file));
    const alvo = normalizeName(cfg.aba);
    const sheet = cache.get(cfg.file).find((s) => normalizeName(s.name).startsWith(alvo));
    if (!sheet) { console.warn(`  ⚠ aba não encontrada: "${cfg.aba}" em ${path.basename(cfg.file)}`); continue; }

    for (const row of sheet.rows.slice(1)) {
      const nome = String(row[cfg.nome] ?? "").trim();
      const cpfRaw = String(row[cfg.cpf] ?? "").trim();
      const cell = row[cfg.senha];
      if (!String(cell ?? "").trim()) continue;
      const p = parseSenhaCell(cell);
      if (cfg.forca2fa) p.tem2fa = true;
      // Só indexa se houver algo aproveitável (senha OU marcação de senha incorreta).
      if (!p.senha && p.status === "pendente") continue;
      const entry = { ...p, aba: `${path.basename(cfg.file)}::${sheet.name}` };
      const cpfFmt = formatCpf(cpfRaw);
      if (cpfFmt) {
        const k = onlyDigits(cpfFmt);
        // Primeira ocorrência com SENHA vence; um registro só-status não sobrescreve senha.
        if (!porCpf.has(k) || (!porCpf.get(k).senha && entry.senha)) porCpf.set(k, entry);
      }
      const nk = normalizeName(nome);
      if (nk) {
        if (!porNome.has(nk) || (!porNome.get(nk).senha && entry.senha)) porNome.set(nk, entry);
      }
      lidas++;
    }
  }
  console.log(`  · índice de senhas: ${porCpf.size} por CPF · ${porNome.size} por nome (${lidas} células úteis lidas)`);
  return { porCpf, porNome };
}

// ─── itens do lote a partir do dry-run ─────────────────────────────────────
function itensDaAba(sheet, cols) {
  const out = [];
  for (const row of sheet.rows.slice(1)) {
    const nome = String(row[cols.nome] ?? "").trim();
    if (!nome) continue;
    const item = { nome };
    if (cols.cpf != null) {
      const cpf = formatCpf(row[cols.cpf]);
      if (cpf) item.cpf = cpf;             // inválido é DESCARTADO (nunca grava sujo)
    }
    const nivel = parseNivel(row[cols.nivel]);
    if (nivel) item.nivel = nivel;
    const banco = String(row[cols.banco] ?? "").trim();
    if (banco) item.banco_beneficio = banco;
    const extratoBancos = cols.extrato != null ? parseExtratoBancos(row[cols.extrato]) : [];
    const rel = parseRelacoes(row[cols.relacoes], { extratoBancos });
    if (rel.length) item.relacoes = rel;
    if (cols.dois_fatores != null && isSim(row[cols.dois_fatores])) item.tem_2fa = true;
    if (cols.senha_errada != null && isSim(row[cols.senha_errada])) item.status_acesso = "senha_incorreta";
    item.__temSenha = cols.tem_senha != null ? isSim(row[cols.tem_senha]) : false;
    out.push(item);
  }
  return out;
}

/** Anexa a senha vinda das originais. Nada é logado. */
function anexarSenha(item, idx) {
  const porCpf = item.cpf ? idx.porCpf.get(onlyDigits(item.cpf)) : null;
  const entry = porCpf ?? idx.porNome.get(normalizeName(item.nome)) ?? null;
  if (!entry) return item;
  if (entry.senha) {
    item.senha = entry.senha;
    if (item.cpf) item.usuario = onlyDigits(item.cpf); // login GOV = CPF (a RPC também faz isso)
  }
  if (entry.tem2fa) item.tem_2fa = true;
  if (entry.status === "senha_incorreta") item.status_acesso = "senha_incorreta";
  return item;
}

// ─── execução ───────────────────────────────────────────────────────────────
async function main() {
  console.log("CARD 1 — importação de clientes das planilhas");
  console.log(`  dir=${DIR} · modo=${EXECUTAR ? "EXECUTAR (grava)" : "CONFERÊNCIA (não grava)"} · lote=${BATCH}${LIMIT ? ` · limite=${LIMIT}` : ""}`);

  for (const f of [F_DRYRUN, F_BANCOS, F_SUSEP]) {
    if (!existsSync(f)) { console.error(`✖ arquivo não encontrado: ${f}`); process.exit(1); }
  }

  const dry = await readWorkbook(F_DRYRUN);
  const pick = (n) => dry.find((s) => normalizeName(s.name) === normalizeName(n));
  const abaImportar = pick("IMPORTAR");
  const abaSemCpf = pick("SEM_CPF");
  const abaJaExistem = pick("JA_EXISTEM");
  if (!abaImportar || !abaSemCpf || !abaJaExistem) {
    console.error("✖ dry-run sem as abas IMPORTAR/SEM_CPF/JA_EXISTEM"); process.exit(1);
  }

  // Layout das abas do dry-run (0-based).
  const itens = [
    ...itensDaAba(abaImportar,   { nome: 0, cpf: 1, nivel: 2, tem_senha: 3, dois_fatores: 4, senha_errada: 5, banco: 6, relacoes: 7, extrato: 8 }),
    ...itensDaAba(abaJaExistem,  { nome: 0, cpf: 1, nivel: 2, tem_senha: 3, banco: 4, relacoes: 5 }),
    ...itensDaAba(abaSemCpf,     { nome: 0, nivel: 1, tem_senha: 2, banco: 3, relacoes: 4 }),
  ];
  console.log(`  · dry-run: IMPORTAR=${abaImportar.rows.length - 1} · JA_EXISTEM=${abaJaExistem.rows.length - 1} · SEM_CPF=${abaSemCpf.rows.length - 1} (CONFLITOS ficam de fora)`);

  const idx = await construirIndiceSenhas();
  for (const it of itens) anexarSenha(it, idx);

  // Conferência contra as métricas do dry-run (sem expor valor algum).
  const comSenha = itens.filter((i) => i.senha).length;
  const com2fa = itens.filter((i) => i.tem_2fa).length;
  const incorreta = itens.filter((i) => i.status_acesso === "senha_incorreta").length;
  const comCpf = itens.filter((i) => i.cpf).length;
  const semCpf = itens.length - comCpf;
  const comNivel = itens.filter((i) => i.nivel).length;
  const bronze = itens.filter((i) => i.nivel === "Bronze").length;
  const comBanco = itens.filter((i) => i.banco_beneficio).length;
  const comRel = itens.filter((i) => i.relacoes?.length).length;
  const marcadosTemSenha = itens.filter((i) => i.__temSenha).length;
  const semSenhaMasMarcado = itens.filter((i) => i.__temSenha && !i.senha && i.status_acesso !== "senha_incorreta").length;

  console.log("\n  RELATÓRIO DE EXTRAÇÃO (esperado do dry-run entre parênteses)");
  console.log(`   itens .............. ${itens.length}`);
  console.log(`   com CPF ............ ${comCpf} (634 + 6 já existentes = 640)`);
  console.log(`   sem CPF ............ ${semCpf} (148)`);
  console.log(`   com senha .......... ${comSenha} (577)`);
  console.log(`   marcados "tem senha" ${marcadosTemSenha} · sem senha localizada: ${semSenhaMasMarcado}`);
  console.log(`   2 fatores .......... ${com2fa} (118)`);
  console.log(`   senha incorreta .... ${incorreta} (24)`);
  console.log(`   com nível .......... ${comNivel} (518) · bronze ${bronze} (115)`);
  console.log(`   com banco pagador .. ${comBanco} (615)`);
  console.log(`   com relação ........ ${comRel} (553)`);

  const paraEnviar = (LIMIT ? itens.slice(0, LIMIT) : itens).map(({ __temSenha, ...rest }) => rest);

  if (!EXECUTAR) {
    console.log("\n  CONFERÊNCIA apenas — nada foi gravado. Reexecute com --executar para importar.");
    console.log("  (Nenhuma senha foi impressa, gravada em arquivo ou exposta.)");
    return;
  }

  // ── login do operador (env; a RPC exige auth.uid(): service-role NÃO serve) ──
  // URL e chave ANON são públicas (a anon key é a mesma que roda no front), então
  // ficam como default para o operador só precisar informar e-mail e senha. A senha
  // NUNCA é argumento de linha de comando (ficaria no histórico do shell).
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || SUPABASE_URL_DEFAULT;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_DEFAULT;
  const email = process.env.IMPORT_USER_EMAIL;
  const senhaOp = process.env.IMPORT_USER_PASSWORD;
  if (!email || !senhaOp) {
    console.error("✖ defina IMPORT_USER_EMAIL e IMPORT_USER_PASSWORD no ambiente.");
    console.error("  A RPC usa auth.uid() para created_by e exige admin/sócio/recepção");
    console.error("  (service-role deixa auth.uid() nulo e a RPC recusa).");
    console.error("  Contas aceitas: admin@juridico.com (Rodrigo), 2mitos2016@gmail.com (Ryan),");
    console.error("  kailane@juridico.com, tais@juridico.com, yasmin@juridico.com.");
    process.exit(1);
  }
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password: senhaOp });
  if (authErr || !auth?.user) { console.error(`✖ login falhou: ${authErr?.message ?? "sem sessão"}`); process.exit(1); }
  console.log(`\n  autenticado como ${auth.user.email}`);

  const total = { criados: 0, enriquecidos: 0, credenciais: 0, relacoes: 0 };
  const erros = [];
  for (let i = 0; i < paraEnviar.length; i += BATCH) {
    const lote = paraEnviar.slice(i, i + BATCH);
    const n = Math.floor(i / BATCH) + 1;
    const { data, error } = await sb.rpc("importar_clientes_planilha", { p_lote: lote });
    if (error) {
      console.error(`  lote ${n}: ✖ ${error.message}`);
      erros.push({ lote: n, erro: error.message, itens: lote.length });
      continue;
    }
    const r = data ?? {};
    total.criados += r.criados ?? 0;
    total.enriquecidos += r.enriquecidos ?? 0;
    total.credenciais += r.credenciais ?? 0;
    total.relacoes += r.relacoes ?? 0;
    const errosLote = Array.isArray(r.erros) ? r.erros : [];
    // O relatório de erro guarda NOME e MOTIVO — nunca a senha.
    for (const e of errosLote) erros.push({ lote: n, nome: e.nome, erro: e.erro });
    console.log(`  lote ${n} (${lote.length}): criados=${r.criados ?? 0} enriquecidos=${r.enriquecidos ?? 0} credenciais=${r.credenciais ?? 0} relacoes=${r.relacoes ?? 0} erros=${errosLote.length}`);
  }

  console.log("\n  TOTAL:", JSON.stringify(total));
  if (erros.length) {
    const out = path.join(DIR, "CARD1-erros-importacao.json");
    await writeFile(out, JSON.stringify(erros, null, 2), "utf8");
    console.log(`  ${erros.length} erro(s) — detalhes (sem senhas) em ${out}`);
  } else {
    console.log("  nenhum erro reportado pela RPC.");
  }
}

main().catch((e) => { console.error("✖ falha:", e?.message ?? e); process.exit(1); });
