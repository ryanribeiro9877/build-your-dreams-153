// Inspeção de ESTRUTURA de planilhas — SÓ a linha de cabeçalho em claro.
//
// IMPORTANTE (privacidade): estas planilhas contêm senhas do GOV.BR e CPFs. Toda
// linha de DADOS é mascarada (apenas o comprimento do valor). A primeira versão
// deste script imprimia as 3 primeiras linhas "assumindo cabeçalho" e acabou
// exibindo credenciais de clientes no terminal — não repetir. Nunca imprima valores
// de dados destas planilhas: nem em log, nem em arquivo, nem em mensagem.
//
// Uso: node scripts/inspect-xlsx.mjs "caminho/arquivo.xlsx" [...]
import { readWorkbook } from "./lib/xlsxLite.mjs";

const COL = (j) => {
  let s = "", n = j + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};
const mask = (v) => {
  const s = String(v ?? "").trim();
  return s ? `<${s.length}ch>` : "";
};

for (const path of process.argv.slice(2)) {
  console.log(`\n████ ${path.split(/[\\/]/).pop()}`);
  const sheets = await readWorkbook(path);
  for (const s of sheets) {
    const nonEmpty = s.rows.filter((r) => r.some((c) => String(c).trim()));
    console.log(`\n── aba "${s.name}" · ${nonEmpty.length} linha(s) não vazias`);
    // Linha 1 = rótulos das colunas (não é dado de cliente).
    const head = (s.rows[0] ?? []).slice(0, 16)
      .map((c, j) => (String(c).trim() ? `${COL(j)}:${String(c).slice(0, 24)}` : ""))
      .filter(Boolean);
    if (head.length) console.log(`   cabeçalho: ${head.join(" | ")}`);
    // Linhas de dados: SOMENTE o formato (quais colunas vêm preenchidas e o tamanho).
    for (const [i, row] of nonEmpty.slice(1, 4).entries()) {
      const cells = row.slice(0, 16)
        .map((c, j) => (String(c).trim() ? `${COL(j)}:${mask(c)}` : ""))
        .filter(Boolean);
      if (cells.length) console.log(`   dados[${i + 1}] (mascarado): ${cells.join(" | ")}`);
    }
  }
}
