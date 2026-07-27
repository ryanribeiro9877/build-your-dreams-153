// CARD 1 — normalizações PURAS da importação de clientes das planilhas.
//
// Tudo aqui é função pura e testável (scripts/lib/card1Normalize.test.mjs). Nenhuma
// função imprime, grava ou loga valor sensível: senha entra e sai como valor de
// retorno, nunca em console.
//
// Regras vindas do briefing:
//   · nome deduplicado por versão sem acento/pontuação em MAIÚSCULAS;
//   · CPF validado por dígito verificador (inválido é DESCARTADO, não gravado sujo);
//   · senha com "pedir/não tem/sem senha" = sem senha;
//   · texto de senha com "errada/incorreta" → status_acesso='senha_incorreta' e a
//     senha NÃO é gravada como válida.

/** Chave de deduplicação: sem acento, sem pontuação, MAIÚSCULAS, espaço único. */
export function normalizeName(raw) {
  return String(raw ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // remove acentos
    .replace(/[^A-Za-z0-9\s]/g, " ")                      // pontuação → espaço
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Só dígitos. */
export const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");

/** Valida CPF por dígito verificador (rejeita repetidos como 111.111.111-11). */
export function isValidCpf(raw) {
  const d = onlyDigits(raw);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** "12345678909" → "123.456.789-09"; inválido → null (nunca grava sujo). */
export function formatCpf(raw) {
  if (!isValidCpf(raw)) return null;
  const d = onlyDigits(raw);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Textos que significam "não há senha" (a planilha usa a célula como recado).
const SEM_SENHA_RE = /(pedir|n[ãa]o\s*tem|nao\s*tem|sem\s*senha|solicitar|aguard|falta)/i;
// Textos que significam "a senha que temos não funciona".
const SENHA_ERRADA_RE = /(errad|incorret|inv[áa]lid|n[ãa]o\s*funciona|bloquead)/i;
// Anotações que a planilha cola junto da senha — precisam sair do valor gravado,
// senão a credencial no cofre fica inutilizável.
const ANOTACAO_2FA_RE = /\s*\(\s*(?:2|dois)\s*fatores?\s*\)\s*/i;
const ANOTACAO_GENERICA_RE = /\s*\(\s*(?:conta\s+)?(?:ouro|prata|bronze|gov)\s*\)\s*/i;

/**
 * Interpreta a célula de senha da planilha.
 * → { senha: string|null, status: 'pendente'|'senha_incorreta', tem2fa: boolean }
 * NUNCA devolve como senha válida um texto-recado ("pedir a senha") nem uma senha
 * marcada como errada.
 */
export function parseSenhaCell(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { senha: null, status: "pendente", tem2fa: false };

  const tem2fa = ANOTACAO_2FA_RE.test(s);
  if (SENHA_ERRADA_RE.test(s)) {
    // Há registro de senha, mas ela não serve: fila de recuperação, sem gravar valor.
    return { senha: null, status: "senha_incorreta", tem2fa };
  }
  if (SEM_SENHA_RE.test(s)) {
    return { senha: null, status: "pendente", tem2fa };
  }
  const limpa = s.replace(ANOTACAO_2FA_RE, " ").replace(ANOTACAO_GENERICA_RE, " ").trim();
  // Sobrou algo curto demais para ser senha (ex.: "x", "-") → trata como ausente.
  if (limpa.length < 4) return { senha: null, status: "pendente", tem2fa };
  return { senha: limpa, status: "pendente", tem2fa };
}

/** "Ouro"/"OURO "/"conta ouro" → "Ouro" | "Prata" | "Bronze" | null. */
export function parseNivel(raw) {
  const s = String(raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\bouro\b/.test(s)) return "Ouro";
  if (/\bprata\b/.test(s)) return "Prata";
  if (/\bbronze\b/.test(s)) return "Bronze";
  return null;
}

/** Marca de "X"/"SIM" numa coluna de banco. */
export function isMarcado(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return false;
  return /^(x+|sim|s|ok|v|✓|true|1)$/i.test(s);
}

const TIPOS_VALIDOS = new Set(["consignado", "emprestimo_pessoal", "cartao_consignado", "seguro", "conta", "outro"]);

/**
 * Parseia a coluna de relações do dry-run: "BMG:consignado; BRB:consignado".
 * Tipo desconhecido cai em 'outro' (a RPC só aceita a lista fechada).
 */
export function parseRelacoes(raw, { extratoBancos = [], ano = null } = {}) {
  const comExtrato = new Set(extratoBancos.map((b) => normalizeName(b)));
  const out = [];
  const vistos = new Set();
  for (const parte of String(raw ?? "").split(/[;,]/)) {
    const t = parte.trim();
    if (!t) continue;
    const [bancoRaw, tipoRaw] = t.split(":");
    const banco = String(bancoRaw ?? "").trim();
    if (!banco) continue;
    let tipo = String(tipoRaw ?? "consignado").trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");
    if (!TIPOS_VALIDOS.has(tipo)) tipo = "outro";
    const chave = `${normalizeName(banco)}|${tipo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const rel = { banco, tipo };
    if (comExtrato.has(normalizeName(banco))) rel.extrato = true;
    if (ano) rel.ano = ano;
    out.push(rel);
  }
  return out;
}

/** Bancos listados na coluna "Extrato em posse" ("BRADESCO; AGIBANK"). */
export function parseExtratoBancos(raw) {
  return String(raw ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

/** SIM/NÃO das colunas booleanas do dry-run. */
export function isSim(raw) {
  return /^(sim|s|x|true|1)$/i.test(String(raw ?? "").trim());
}
