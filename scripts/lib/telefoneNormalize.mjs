// ============================================================================
// Adendo ao CARD 1 — normalização de TELEFONE das planilhas legadas
// ============================================================================
// Regras puras e testáveis (nenhum acesso a rede/banco), no mesmo trilho de
// card1Normalize.mjs. O importador chama estas funções ANTES de montar o lote
// que vai para `importar_telefones_planilha`.
//
// DECISÃO DE FORMATO (medida no banco em 29/07/2026):
// os 6 telefones que já existem estão COM MÁSCARA (10 e 11 dígitos + separadores),
// que é o que o wizard de cadastro grava (formatPhone do front). O filtro
// `telefone` de search_clients é `phone ILIKE '%X%'`, e medido no banco:
//     '(71) 98888-7777' ILIKE '%71988%'  →  FALSE
//     '71988887777'     ILIKE '%71988%'  →  TRUE
// Ou seja, misturar os dois formatos quebra a busca por telefone de forma
// silenciosa. Gravamos COM MÁSCARA para ficar idêntico ao que já está lá e ao
// que o cadastro produz — a consistência vale mais que a preferência.
//
// O QUE NUNCA FAZEMOS AQUI (fora de escopo, por decisão do desenho):
//   · inventar o nono dígito de números pré-2016;
//   · corrigir DDD;
//   · inferir WhatsApp (só entra se a planilha DECLARAR).
// ============================================================================

/** DDD brasileiro válido: 11–99 (não existe DDD começando em 0 ou 1x<11). */
function dddValido(ddd) {
  const n = Number(ddd);
  return Number.isInteger(n) && n >= 11 && n <= 99;
}

/**
 * Aplica a máscara brasileira aos dígitos — MESMO formato do formatPhone() do
 * front: "(71) 98888-7777" (11 dígitos) e "(71) 3333-4444" (10 dígitos).
 */
export function formatarTelefoneBR(digitos) {
  const d = String(digitos ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/**
 * Classifica UM candidato já reduzido a dígitos.
 * Devolve { ok:true, telefone, digitos, tipo, aviso? } ou { ok:false, motivo }.
 *
 * `aviso: "formato_antigo_verificar"` marca o 8-dígitos começando em 9/8/7 —
 * celular no formato pré-2016. Vai para o lote COMO ESTÁ (não inventamos o nono
 * dígito) e a recepção confirma na ligação.
 */
export function classificarTelefone(bruto) {
  let d = String(bruto ?? "").replace(/\D/g, "");

  // Prefixo de país: só remove quando o que sobra tem tamanho de telefone
  // nacional (10 ou 11), senão "5511..." poderia ser mutilado por engano.
  if (d.length >= 12 && d.length <= 13 && d.startsWith("55")) {
    const semPais = d.slice(2);
    if (semPais.length === 10 || semPais.length === 11) d = semPais;
  }

  if (d.length < 10) return { ok: false, motivo: "curto_demais", digitos: d };
  if (d.length > 11) return { ok: false, motivo: "longo_demais", digitos: d };
  // Sequência de um só dígito (0000000000, 9999999999) é lixo de digitação.
  if (/^(\d)\1+$/.test(d)) return { ok: false, motivo: "digito_repetido", digitos: d };

  const ddd = d.slice(0, 2);
  if (!dddValido(ddd)) return { ok: false, motivo: "ddd_invalido", digitos: d };

  const resto = d.slice(2);
  if (resto.length === 9) {
    // Celular atual: nono dígito é 9 por definição da numeração brasileira.
    if (!resto.startsWith("9")) return { ok: false, motivo: "celular_sem_nove", digitos: d };
    return { ok: true, telefone: formatarTelefoneBR(d), digitos: d, tipo: "celular" };
  }
  // 8 dígitos: fixo (2–5) ou celular pré-2016 (6–9).
  const inicial = resto[0];
  if (inicial >= "2" && inicial <= "5") {
    return { ok: true, telefone: formatarTelefoneBR(d), digitos: d, tipo: "fixo" };
  }
  return {
    ok: true, telefone: formatarTelefoneBR(d), digitos: d,
    tipo: "celular_antigo", aviso: "formato_antigo_verificar",
  };
}

/**
 * Extrai TODOS os telefones de uma célula. Uma célula legada costuma trazer
 * vários números juntos ("71 98888-7777 / 71 3333-4444", "719888…, 713333…").
 *
 * A quebra é feita por qualquer separador não-numérico com 2+ caracteres OU por
 * marcadores explícitos (/, ;, |, vírgula, "e", "ou"). Grupos de dígitos vizinhos
 * separados por um único caractere (espaço, hífen, parêntese) continuam juntos,
 * porque é assim que uma máscara é escrita.
 */
export function extrairTelefonesDaCelula(celula) {
  const txt = String(celula ?? "").trim();
  if (!txt) return { telefones: [], descartes: [] };

  const pedacos = txt
    .split(/\s*(?:[/;|,]|\bou\b|\be\b)\s*|\s{2,}/i)
    .map(s => s.trim())
    .filter(Boolean);

  // Um pedaço pode AINDA conter dois números colados por máscara completa
  // ("(71)98888-7777(71)3333-4444"): quebra por "(" quando há mais de um.
  const candidatos = [];
  for (const p of pedacos) {
    const porParenteses = p.split(/(?=\()/).map(s => s.trim()).filter(Boolean);
    candidatos.push(...(porParenteses.length > 1 ? porParenteses : [p]));
  }

  const telefones = [];
  const descartes = [];
  const vistos = new Set();
  for (const c of candidatos) {
    if (!/\d/.test(c)) continue;                 // pedaço sem dígito: ruído textual
    const r = classificarTelefone(c);
    if (!r.ok) { descartes.push({ valor: c, motivo: r.motivo, digitos: r.digitos }); continue; }
    if (vistos.has(r.digitos)) continue;         // dedupe dentro da própria célula
    vistos.add(r.digitos);
    telefones.push(r);
  }
  return { telefones, descartes };
}

/** "sim"/"s"/"x"/"true"/"1" → true; "não"/"n"/"0"/"false" → false; resto → null.
 *  null significa NÃO DECLARADO: a RPC não mexe no flag de WhatsApp nesse caso.
 *  Nunca inferimos WhatsApp a partir de "é celular". */
export function parseWhatsappDeclarado(valor) {
  const s = String(valor ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["sim", "s", "x", "true", "1", "yes", "y", "zap", "whats", "whatsapp"].includes(s)) return true;
  if (["nao", "não", "n", "false", "0", "no"].includes(s)) return false;
  return null;
}

/**
 * Monta o item do lote para um cliente. Dedupe entre TODAS as células do mesmo
 * cliente (a mesma pessoa aparece em várias planilhas/abas).
 *
 * Devolve null quando não sobrou telefone algum — item sem telefone não vai para
 * o lote (a RPC o ignoraria de todo jeito).
 */
export function montarItemTelefone({ nome, cpf, celulas, whatsapp, origem }) {
  const nomeLimpo = String(nome ?? "").trim();
  if (!nomeLimpo) return null;

  const telefones = [];
  const descartes = [];
  const avisos = [];
  const vistos = new Set();
  for (const cel of (celulas ?? [])) {
    const r = extrairTelefonesDaCelula(cel);
    descartes.push(...r.descartes);
    for (const t of r.telefones) {
      if (vistos.has(t.digitos)) continue;
      vistos.add(t.digitos);
      telefones.push(t.telefone);
      if (t.aviso) avisos.push({ telefone: t.telefone, aviso: t.aviso });
    }
  }
  if (telefones.length === 0) return null;

  return {
    item: {
      nome: nomeLimpo,
      cpf: String(cpf ?? "").replace(/\D/g, "") || null,
      telefones,
      whatsapp_declarado: parseWhatsappDeclarado(whatsapp),
      origem: String(origem ?? "").trim() || null,
    },
    descartes,
    avisos,
  };
}

/**
 * Heurística de detecção da COLUNA de telefone pelo cabeçalho. Só sugere — o
 * pipeline exige confirmação humana com amostra antes de usar (nenhum palpite
 * silencioso de coluna).
 */
export function pontuarCabecalhoTelefone(cabecalho) {
  const h = String(cabecalho ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  if (!h) return 0;
  if (/(^|[^a-z])(tel|fone|celular|cel|whats|zap|contato|movel)/.test(h)) return 2;
  if (/telefone|numero/.test(h)) return 2;
  if (/ddd/.test(h)) return 1;
  return 0;
}
