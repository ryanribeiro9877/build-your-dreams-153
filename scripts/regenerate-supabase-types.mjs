#!/usr/bin/env node
/**
 * V20 — Regenera src/integrations/supabase/types.ts a partir do schema atual.
 *
 * Pré-requisitos:
 *   - Supabase CLI instalado: npm i -g supabase
 *   - SUPABASE_ACCESS_TOKEN no env (gere em https://supabase.com/dashboard/account/tokens)
 *
 * Uso:
 *   node scripts/regenerate-supabase-types.mjs
 *
 * O que faz:
 *   1. Roda `supabase gen types typescript --project-id <id> --schema public`
 *   2. Escreve em src/integrations/supabase/types.ts
 *   3. Faz git diff stat pra mostrar a mudança
 *   4. NÃO commita — você revisa e commita você mesmo
 */

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID;
if (!PROJECT_ID) {
  console.error("ERROR: SUPABASE_PROJECT_ID environment variable is required.");
  process.exit(1);
}
const TARGET = resolve(PROJECT_ROOT, "src/integrations/supabase/types.ts");

function log(msg) { console.log(`[regen-types] ${msg}`); }

function checkPrereqs() {
  try {
    execSync("supabase --version", { stdio: "pipe" });
  } catch {
    log("ERRO: Supabase CLI não encontrado.");
    log("Instale com: npm i -g supabase");
    process.exit(1);
  }

  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    log("ERRO: SUPABASE_ACCESS_TOKEN não definido.");
    log("Gere em: https://supabase.com/dashboard/account/tokens");
    log("Depois: export SUPABASE_ACCESS_TOKEN=seu_token_aqui");
    process.exit(1);
  }
}

function generate() {
  log(`Gerando tipos do projeto ${PROJECT_ID}...`);

  let output;
  try {
    output = execSync(
      `supabase gen types typescript --project-id ${PROJECT_ID} --schema public`,
      { stdio: ["pipe", "pipe", "inherit"], encoding: "utf-8" },
    );
  } catch (e) {
    log("ERRO ao gerar tipos.");
    log(e.message);
    process.exit(1);
  }

  if (!output || output.length < 500) {
    log("ERRO: saída do supabase gen suspeita (muito curta).");
    process.exit(1);
  }

  // Backup do antigo
  if (existsSync(TARGET)) {
    const old = readFileSync(TARGET, "utf-8");
    const backupPath = TARGET + ".bak";
    writeFileSync(backupPath, old);
    log(`Backup: ${backupPath}`);
  }

  writeFileSync(TARGET, output);
  log(`✓ Escrito: ${TARGET}`);
  log(`  Tamanho: ${(output.length / 1024).toFixed(1)} KB`);

  // Mostra diff
  try {
    const diff = execSync(`git diff --stat ${TARGET}`, { encoding: "utf-8", cwd: PROJECT_ROOT });
    log("Mudança:");
    console.log(diff);
  } catch {
    log("(não foi possível mostrar diff — talvez não esteja num repo git)");
  }

  log("Próximos passos:");
  log("  1. Revise o arquivo: code src/integrations/supabase/types.ts");
  log("  2. Rode: npx tsc --noEmit -p tsconfig.app.json");
  log("  3. Limpe os `as never` / `as \"agents\"` agora desnecessários");
  log("  4. Commit: git add src/integrations/supabase/types.ts && git commit -m 'chore: regen types V20'");
}

checkPrereqs();
generate();
