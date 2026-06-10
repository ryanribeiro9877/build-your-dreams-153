// supabase/functions/chat-orchestrator/mechanicalValidator.ts
//
// Validador MECÂNICO pós-N3 (Patch V25) — roda sobre a peça CONCATENADA do
// Caminho B, ANTES da validação do N2 (LLM). Tudo aqui é determinístico
// (regex/aritmética), sem LLM: pega o que validação por LLM pequena não pega
// (extenso divergente, invariantes do escritório, síntese × corpo, léxico
// proibido por tipo de ação, aritmética do cálculo, súmula fora do catálogo).
//
// Severidade: "error" devolve ao N3 para correção (loop existente, até 2
// rodadas); "warning" não bloqueia — vai para o checklist final da peça.
//
// Módulo PURO (sem APIs Deno) — testável fora do edge runtime.

export type MechSeverity = "error" | "warning";

export interface MechViolation {
  code: string;
  severity: MechSeverity;
  excerpt: string;
  hint: string;
}

export interface MechContext {
  acaoTipo?: string | null;   // fraude_inexistencia | revisional_juros | rmc_rcc | portabilidade | seguro_atrelado | outro
  fixedFacts?: string | null; // bloco técnico FATOS_FIXADOS do bloco 1 (contém a linha CALC_JSON)
}

// ─── helpers de texto ────────────────────────────────────────────────────────

// Remoção de acento PRESERVANDO comprimento/índices (mapa char→char, sem NFD
// global que encurta a string). Índices do texto "folded" valem no original.
const ACCENT_MAP: Record<string, string> = {
  "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "Á": "A", "À": "A", "Â": "A", "Ã": "A", "Ä": "A",
  "é": "e", "è": "e", "ê": "e", "ë": "e", "É": "E", "È": "E", "Ê": "E", "Ë": "E",
  "í": "i", "ì": "i", "î": "i", "ï": "i", "Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
  "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "Ó": "O", "Ò": "O", "Ô": "O", "Õ": "O", "Ö": "O",
  "ú": "u", "ù": "u", "û": "u", "ü": "u", "Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
  "ç": "c", "Ç": "C", "ñ": "n", "Ñ": "N",
};
function fold(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) out += ACCENT_MAP[s[i]] ?? s[i];
  return out.toLowerCase();
}

// Normalização para COMPARAÇÃO (não preserva índices): sem acento, caixa alta,
// espaços colapsados. Range de combining marks via \u escapes (não literais).
const COMBINING_RE = new RegExp("[\\u0300-\\u036f]", "g");
function norm(s: string): string {
  return s.normalize("NFD").replace(COMBINING_RE, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}

// Trecho de até `max` chars do texto ORIGINAL, com espaços colapsados.
function excerptAt(text: string, start: number, end: number, max = 120): string {
  return text.slice(Math.max(0, start), Math.min(text.length, end))
    .replace(/\s+/g, " ").trim().slice(0, max);
}

// Chave de identidade de uma violação (code + excerpt normalizado). Usada para
// detectar deadlock no loop de correção (rodadas com violações idênticas).
export function violationKey(v: { code: string; excerpt: string }): string {
  return v.code + "|" + (v.excerpt || "").normalize("NFD").replace(COMBINING_RE, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}

// ─── Check 1: numeral × extenso ──────────────────────────────────────────────

// "1.386,54" -> centavos (pt-BR: ponto = milhar, vírgula = decimal). null se não parsear.
function numeralToCentavos(num: string): number | null {
  const m = num.trim().match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const inteiro = Number(m[1].replace(/\./g, ""));
  if (!Number.isFinite(inteiro)) return null;
  const cent = m[2] ? Number((m[2] + "0").slice(0, 2)) : 0;
  return inteiro * 100 + cent;
}

const EXT_UNITS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19,
};
const EXT_TENS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
};
const EXT_HUNDREDS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

// Converte uma sequência de palavras pt-BR em número. Tolera "um mil" e "mil".
// Retorna null se reconhecer pouca coisa (texto entre parênteses que não é extenso).
function wordsToNumber(tokens: string[]): { value: number; known: number; unknown: number } {
  let total = 0, current = 0, known = 0, unknown = 0;
  for (const tok of tokens) {
    if (tok === "e" || tok === "de") continue;
    if (tok in EXT_UNITS) { current += EXT_UNITS[tok]; known++; continue; }
    if (tok in EXT_TENS) { current += EXT_TENS[tok]; known++; continue; }
    if (tok in EXT_HUNDREDS) { current += EXT_HUNDREDS[tok]; known++; continue; }
    if (tok === "mil") { total += (current || 1) * 1000; current = 0; known++; continue; }
    if (tok === "milhao" || tok === "milhoes") { total += (current || 1) * 1_000_000; current = 0; known++; continue; }
    unknown++;
  }
  return { value: total + current, known, unknown };
}

// Extenso pt-BR → centavos. null quando o conteúdo não parece um extenso monetário.
export function extensoToCentavos(extenso: string): number | null {
  const tokens = fold(extenso).match(/[a-z]+/g) || [];
  if (tokens.length === 0) return null;
  const iReal = tokens.findIndex((t) => t === "real" || t === "reais");
  const iCent = tokens.findIndex((t) => t === "centavo" || t === "centavos");
  let reaisTokens: string[] = [], centTokens: string[] = [];
  if (iReal >= 0) {
    reaisTokens = tokens.slice(0, iReal);
    centTokens = iCent > iReal ? tokens.slice(iReal + 1, iCent) : [];
  } else if (iCent >= 0) {
    centTokens = tokens.slice(0, iCent);
  } else {
    return null; // sem "reais" nem "centavos": não é extenso monetário
  }
  const r = wordsToNumber(reaisTokens);
  const c = wordsToNumber(centTokens);
  const known = r.known + c.known;
  const unknown = r.unknown + c.unknown;
  // Exige reconhecimento suficiente (evita falso positivo em parêntese não-extenso).
  if (known === 0 || unknown > known) return null;
  if (c.value > 99) return null;
  return r.value * 100 + c.value;
}

function checkNumeralExtenso(text: string): MechViolation[] {
  const out: MechViolation[] = [];
  const re = /R\$\s*([\d.,]+)\s*\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const numC = numeralToCentavos(m[1]);
    const extC = extensoToCentavos(m[2]);
    if (numC === null || extC === null) continue; // não dá para comparar com segurança
    if (numC !== extC) {
      out.push({
        code: "EXTENSO_DIVERGENTE", severity: "error",
        excerpt: excerptAt(text, m.index, m.index + m[0].length),
        hint: `O valor por extenso não corresponde ao numeral: R$ ${m[1]} = ${numC} centavos, mas o extenso equivale a ${extC} centavos. Corrija o extenso para refletir EXATAMENTE o numeral.`,
      });
    }
  }
  return out;
}

// ─── infraestrutura de seções/títulos ────────────────────────────────────────

interface TitleLine { num: string; text: string; lineIdx: number; charStart: number; charEnd: number; }

// Linha de título: numeração romana (com subnível .n opcional), separador
// (— – - . : ) ou apenas espaço, como na síntese "I Preliminares"), texto.
// V25.1: tolera prefixo markdown (#, ##, ###, **, >, bullets) e markdown ao
// final (** de bold, # de heading) — o N3 às vezes emite títulos como
// "**III.1 — DA ...**" ou "## III — DO DIREITO". Sem isso o título escapa do
// extrator, a síntese é regenerada sem ele E o Check 3 compara o resultado
// quebrado consigo mesmo (um bug, dois sintomas — run real 25adb4a6).
const TITLE_RE = /^[\s>#*•\-]*([IVXLC]{1,5}(?:\.\d{1,2})*)(?:\s*[—–\-.:)]+\s*|\s+)(.+?)[\s*#]*$/;

// Remove ornamentos markdown (**, #) do texto capturado e colapsa espaços.
function cleanTitleText(s: string): string {
  return (s || "").replace(/\*+/g, "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
}

function isUpperDominant(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  let upper = 0;
  for (const ch of letters) if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper++;
  return upper / letters.length >= 0.7;
}

// Título de SEÇÃO do corpo: em caixa alta dominante OU começando com
// "Da/Do/Das/Dos/De", sem terminar em marcador de item de lista (; ,).
// V25.1: o cap de comprimento subiu de 90 → 200. Títulos legítimos de seção
// são multi-cláusula e longos (ex.: "III.1 — DA APLICAÇÃO DO CÓDIGO DE DEFESA
// DO CONSUMIDOR. RELAÇÃO DE CONSUMO. RESPONSABILIDADE OBJETIVA DO RÉU", ~99
// chars) — o cap de 90 os descartava silenciosamente. A discriminação contra
// itens de pedido ("I) CONDENAR ... ;") já vem de isUpperDominant + fim em ; ,.
function isBodyTitle(num: string, text: string): boolean {
  if (text.length > 200) return false;
  if (/[;,]$/.test(text.trim())) return false;
  return isUpperDominant(text) || /^d[aoe]s?\s/i.test(text);
}

interface Lines { lines: string[]; starts: number[]; }
function splitLines(text: string): Lines {
  const lines = text.split("\n");
  const starts: number[] = [];
  let pos = 0;
  for (const l of lines) { starts.push(pos); pos += l.length + 1; }
  return { lines, starts };
}

interface SinteseLayout {
  found: boolean;
  headingLineIdx: number;      // linha do título "SÍNTESE DA INICIAL"
  itemsStartLine: number;      // primeira linha de item (inclusive)
  itemsEndLine: number;        // última linha consumida pela síntese (exclusive)
  items: TitleLine[];          // títulos listados na síntese
  corpoTitles: TitleLine[];    // títulos reais do corpo (após a síntese)
}

// Localiza a síntese e os títulos do corpo. A região da síntese consome linhas
// de item/blank consecutivas após o cabeçalho e termina (a) quando uma numeração
// REPETE (o corpo recomeça em "I") ou (b) na primeira linha de prosa.
function analyzeSintese(text: string): SinteseLayout {
  const { lines, starts } = splitLines(text);
  const layout: SinteseLayout = {
    found: false, headingLineIdx: -1, itemsStartLine: -1, itemsEndLine: -1,
    items: [], corpoTitles: [],
  };
  const headingIdx = lines.findIndex((l) => /sintese\s+da\s+inicial/.test(fold(l)));
  let corpoStartLine = 0;
  if (headingIdx >= 0) {
    layout.found = true;
    layout.headingLineIdx = headingIdx;
    layout.itemsStartLine = headingIdx + 1;
    const seen = new Set<string>();
    let i = headingIdx + 1;
    let lastWasTitle = -1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue; // blank dentro da lista
      const m = line.match(TITLE_RE);
      if (!m) break; // prosa → síntese acabou
      const numKey = m[1].toUpperCase();
      if (seen.has(numKey)) break; // numeração repetiu → começo do corpo
      seen.add(numKey);
      layout.items.push({ num: numKey, text: cleanTitleText(m[2]), lineIdx: i, charStart: starts[i], charEnd: starts[i] + line.length });
      lastWasTitle = i;
    }
    layout.itemsEndLine = i;
    corpoStartLine = i;
    // Caso degenerado: a "lista" terminou em prosa logo após um título → aquele
    // título era o início do corpo, não um item da síntese.
    if (layout.items.length > 0 && lastWasTitle === i - 1 && i < lines.length && lines[i].trim()) {
      const lastItem = layout.items[layout.items.length - 1];
      const others = layout.items.slice(0, -1);
      if (others.length === 0 || lastItem.num === others[0]?.num || lastItem.num === "I") {
        layout.items = others;
        layout.itemsEndLine = lastItem.lineIdx;
        corpoStartLine = lastItem.lineIdx;
      }
    }
  }
  for (let i = corpoStartLine; i < lines.length; i++) {
    const m = lines[i].match(TITLE_RE);
    if (!m) continue;
    const text = cleanTitleText(m[2]);
    if (!isBodyTitle(m[1], text)) continue;
    layout.corpoTitles.push({ num: m[1].toUpperCase(), text, lineIdx: i, charStart: starts[i], charEnd: starts[i] + lines[i].length });
  }
  return layout;
}

// ─── FRENTE 3: síntese regenerada mecanicamente a partir do corpo ────────────

// Substitui os itens da SÍNTESE DA INICIAL pelos títulos REAIS do corpo (mesma
// formatação de linha do próprio corpo). Pós-processamento — nenhum prompt muda.
export function regenerateSintese(text: string): string {
  const layout = analyzeSintese(text);
  if (!layout.found || layout.corpoTitles.length < 2) return text;
  const { lines } = splitLines(text);
  const itemLines = layout.corpoTitles.map((t) => lines[t.lineIdx].trim());
  const before = lines.slice(0, layout.itemsStartLine);
  const after = lines.slice(Math.max(layout.itemsEndLine, layout.itemsStartLine));
  return [...before, "", ...itemLines, ""].join("\n") + (after.length ? "\n" + after.join("\n") : "");
}

// V25.1 (Item 2c): auditoria do extrator — expõe os títulos que o validador
// enxergou na síntese e no corpo. Gravado em mech_report a cada rodada; sem
// isso, um bug do extrator (síntese regenerada == corpo extraído) fica
// invisível, pois o Check 3 compara o resultado quebrado consigo mesmo.
export function extractTitlesForAudit(text: string): { sintese: string[]; corpo: string[] } {
  const layout = analyzeSintese(text);
  return {
    sintese: layout.items.map((t) => `${t.num} ${t.text}`),
    corpo: layout.corpoTitles.map((t) => `${t.num} ${t.text}`),
  };
}

// ─── Check 3: síntese × corpo + tese duplicada ───────────────────────────────

function titleKey(t: TitleLine): string { return `${t.num} ${norm(t.text)}`; }

function checkSinteseVsCorpo(text: string): MechViolation[] {
  const out: MechViolation[] = [];
  const layout = analyzeSintese(text);
  if (layout.found && layout.items.length > 0 && layout.corpoTitles.length > 0) {
    const sintese = layout.items.map(titleKey);
    const corpo = layout.corpoTitles.map(titleKey);
    const corpoSet = new Set(corpo), sinteseSet = new Set(sintese);
    const faltam = corpo.filter((k) => !sinteseSet.has(k));
    const sobram = sintese.filter((k) => !corpoSet.has(k));
    const sameSet = faltam.length === 0 && sobram.length === 0;
    const sameOrder = sameSet && sintese.join("|") === corpo.join("|");
    if (!sameSet || !sameOrder) {
      const parts: string[] = [];
      if (faltam.length) parts.push(`faltam na síntese: ${faltam.join("; ")}`);
      if (sobram.length) parts.push(`sobram na síntese (sem seção no corpo): ${sobram.join("; ")}`);
      if (sameSet && !sameOrder) parts.push("a ordem dos títulos na síntese difere da ordem do corpo");
      out.push({
        code: "SINTESE_DIVERGE_CORPO", severity: "error",
        excerpt: excerptAt(text, layout.items[0]?.charStart ?? 0, (layout.items[0]?.charEnd ?? 80)),
        hint: `A SÍNTESE DA INICIAL não espelha os títulos do corpo — ${parts.join(" | ")}. Reescreva a síntese listando EXATAMENTE os títulos do corpo, na mesma ordem.`,
      });
    }
  }
  // Tese duplicada: shingles de 5 palavras entre corpos de seções (Jaccard > 0.6).
  const sections: { title: TitleLine; body: string }[] = [];
  const { lines } = splitLines(text);
  for (let i = 0; i < layout.corpoTitles.length; i++) {
    const start = layout.corpoTitles[i].lineIdx + 1;
    const end = i + 1 < layout.corpoTitles.length ? layout.corpoTitles[i + 1].lineIdx : lines.length;
    sections.push({ title: layout.corpoTitles[i], body: lines.slice(start, end).join("\n") });
  }
  const shingleSets = sections.map((s) => {
    const words = fold(s.body).match(/[a-z0-9]+/g) || [];
    const set = new Set<string>();
    for (let i = 0; i + 5 <= words.length; i++) set.add(words.slice(i, i + 5).join(" "));
    return set;
  });
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = shingleSets[i], b = shingleSets[j];
      if (a.size < 30 || b.size < 30) continue; // seções curtas: ruído
      let inter = 0;
      for (const sh of a) if (b.has(sh)) inter++;
      const jac = inter / (a.size + b.size - inter);
      if (jac > 0.6) {
        out.push({
          code: "TESE_DUPLICADA", severity: "error",
          excerpt: excerptAt(text, sections[j].title.charStart, sections[j].title.charEnd),
          hint: `As seções "${sections[i].title.num} ${sections[i].title.text}" e "${sections[j].title.num} ${sections[j].title.text}" têm corpo quase idêntico (similaridade ${jac.toFixed(2)}). Remova/reescreva a duplicata mantendo uma única tese por seção.`,
        });
      }
    }
  }
  return out;
}

// ─── Check 2: invariantes do escritório ──────────────────────────────────────

interface Region { start: number; end: number; }

function findPedidosRegion(text: string): Region | null {
  const f = fold(text);
  const m = f.match(/\bdos\s+pedidos\b/);
  if (!m || m.index === undefined) return null;
  const fim = f.slice(m.index).search(/pede\s+deferimento/);
  return { start: m.index, end: fim >= 0 ? m.index + fim : text.length };
}

function checkInvariantesEscritorio(text: string): MechViolation[] {
  const out: MechViolation[] = [];
  const f = fold(text);
  const pedidos = findPedidosRegion(text);

  // (a) Tutela de urgência → multa de R$ 1.000,00 + art. 537 no bloco da multa.
  if (/tutela\s+de\s+urg/.test(f)) {
    // Procura parágrafos que falem de multa da tutela (na seção IV e/ou nos pedidos).
    const paras: { start: number; end: number }[] = [];
    const re = /multa/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(f)) !== null) {
      const ps = f.lastIndexOf("\n\n", mm.index);
      const pe = f.indexOf("\n\n", mm.index);
      paras.push({ start: ps < 0 ? 0 : ps, end: pe < 0 ? f.length : pe });
    }
    const okPara = paras.find((p) => {
      const t = f.slice(p.start, p.end);
      return /r\$\s*1\.?000,00/.test(t) && /art(igo)?\s*\.?\s*537/.test(t);
    });
    if (!okPara) {
      const sample = paras[0];
      out.push({
        code: "MULTA_PADRAO_TUTELA", severity: "error",
        excerpt: sample ? excerptAt(text, sample.start, sample.end) : "(nenhum bloco de multa encontrado)",
        hint: "A peça contém pedido de tutela de urgência: o bloco da multa DEVE fixar multa diária de R$ 1.000,00 (mil reais) com fundamento no art. 537 do CPC. Ajuste valor e fundamento exatamente assim.",
      });
    }
  }

  // (b) Pedido de intimações exclusivas: "exclusivamente em nome" + OAB 80.891.
  if (pedidos) {
    const t = f.slice(pedidos.start, pedidos.end);
    const temExcl = /exclusivamente\s+em\s+nome/.test(t) && /80\.?891/.test(t);
    if (!temExcl) {
      out.push({
        code: "INTIMACAO_EXCLUSIVA_AUSENTE", severity: "error",
        excerpt: excerptAt(text, pedidos.start, pedidos.start + 120),
        hint: "Falta nos PEDIDOS o requerimento padrão de intimações/publicações EXCLUSIVAMENTE EM NOME do advogado com OAB 80.891. Inclua esse pedido (combinação obrigatória: 'exclusivamente em nome' + '80.891').",
      });
    }
  }

  // (c) Data do fecho: após "pede deferimento", a linha de data deve ter [A PREENCHER.
  const pd = f.lastIndexOf("pede deferimento");
  if (pd >= 0) {
    const tail = text.slice(pd);
    const ftail = f.slice(pd);
    const dateRe = /\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4}/g;
    let dm: RegExpExecArray | null;
    while ((dm = dateRe.exec(ftail)) !== null) {
      const ls = ftail.lastIndexOf("\n", dm.index) + 1;
      const le = ftail.indexOf("\n", dm.index);
      const line = ftail.slice(ls, le < 0 ? ftail.length : le);
      if (!line.includes("a preencher")) {
        out.push({
          code: "DATA_CRAVADA_FECHO", severity: "error",
          excerpt: excerptAt(tail, ls, le < 0 ? tail.length : le),
          hint: "A data do fecho NÃO pode vir cravada: a linha de data deve usar o marcador [A PREENCHER: data do protocolo]. Substitua a data fixa pelo marcador.",
        });
        break; // uma violação basta
      }
    }
  }

  // (d) Custas em JEC: pedido condenatório de custas processuais → warning.
  if (pedidos) {
    const regionText = text.slice(pedidos.start, pedidos.end);
    for (const line of regionText.split("\n")) {
      const fl = fold(line);
      if (!/^\s*(?:[a-z]\)|[ivxlc]+[.)]|\d+[.)\-])/i.test(line)) continue;
      if (!/custas\s+processuais/.test(fl)) continue;
      if (/gratuid|isen[cs]/.test(fl)) continue; // pedido de gratuidade: ok
      if (/condena|pagamento/.test(fl)) {
        out.push({
          code: "CUSTAS_EM_JEC", severity: "warning",
          excerpt: excerptAt(line, 0, line.length),
          hint: "Há pedido condenatório de custas processuais: em JEC (1º grau) não há condenação em custas (art. 55 da Lei 9.099/95). Confirmar se a inclusão foi deliberada.",
        });
        break;
      }
    }
  }
  return out;
}

// ─── Check 4: léxico proibido por acao_tipo ──────────────────────────────────

const FORBIDDEN_BY_TIPO: Record<string, string[]> = {
  revisional_juros: [
    "fraude", "inexistencia de contrato", "inexistencia de relacao juridica",
    "escada ponteana", "sumula 479", "plano da existencia",
  ],
  fraude_inexistencia: ["acao revisional", "revisao da clausula de juros"],
};

// V25.1 (Item 1a): o Check 4 varre SOMENTE o corpo da petição — do primeiro
// "EXCELENTÍSSIMO" (endereçamento) até antes de qualquer checklist/análise
// anexada. A ANÁLISE PRÉ-REDAÇÃO (acima do endereçamento), o CHECKLIST DE
// PENDÊNCIAS e o checklist do próprio validador ficam FORA — neles o termo
// proibido aparece de forma legítima (o N3 DECLARA "revisional, não fraude").
function corpoPeticaoRange(text: string): { start: number; end: number } {
  const f = fold(text);
  let start = f.indexOf("excelentissimo");
  if (start < 0) start = 0;
  let end = text.length;
  // Corta em qualquer seção anexada após o corpo (checklist/análise).
  for (const mk of ["checklist de pendencias", "checklist do validador", "analise pre-redacao", "analise pre redacao"]) {
    const idx = f.indexOf(mk, start + 1);
    if (idx > start && idx < end) end = idx;
  }
  return { start, end };
}

// V25.1 (Item 1b): padrões de negação. Uma ocorrência precedida (até 30 chars)
// por um destes NÃO é violação ("não é fraude", "(não fraude)", "NÃO de fraude").
const NEGATION_PATTERNS = ["nao e", "nao se trata de", "nao configura", "(nao", "nao de", "sem que haja"];

// V25.1 (Item 1c): ocorrência dentro de aspas (", ", «») ou de bloco de citação
// (linha iniciada por ">") é citação literal de norma/súmula — rebaixa de error
// para warning (o termo pode constar legitimamente do texto citado).
function isInsideQuoteOrCitation(text: string, idx: number): boolean {
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  const lineEndRaw = text.indexOf("\n", idx);
  const line = text.slice(lineStart, lineEndRaw < 0 ? text.length : lineEndRaw);
  if (/^\s*>/.test(line)) return true; // bloco de citação markdown
  // Aspas: examina o parágrafo do match e testa se o índice cai num par de aspas.
  const paraStart = Math.max(text.lastIndexOf("\n\n", idx) + 2, 0);
  const paraEndRaw = text.indexOf("\n\n", idx);
  const para = text.slice(paraStart, paraEndRaw < 0 ? text.length : paraEndRaw);
  const rel = idx - paraStart;
  let open = -1;
  for (let i = 0; i < para.length; i++) {
    const ch = para[i];
    if (ch === '"' || ch === "“" || ch === "”" || ch === "«" || ch === "»") {
      if (open < 0) { open = i; }
      else { if (rel > open && rel < i) return true; open = -1; }
    }
  }
  return false;
}

function checkLexicoProibido(text: string, acaoTipo: string | null | undefined): MechViolation[] {
  const out: MechViolation[] = [];
  const terms = acaoTipo ? FORBIDDEN_BY_TIPO[acaoTipo] : null;
  if (!terms) return out;
  const { start, end } = corpoPeticaoRange(text);
  const corpo = text.slice(start, end);
  const f = fold(corpo);
  for (const term of terms) {
    let from = 0, hits = 0;
    while (hits < 5) { // teto por termo (evita inundar o feedback)
      const idx = f.indexOf(term, from);
      if (idx < 0) break;
      from = idx + term.length;
      // Negação (Item 1b): ignora a ocorrência por completo.
      const before = f.slice(Math.max(0, idx - 30), idx);
      if (NEGATION_PATTERNS.some((n) => before.includes(n))) continue;
      hits++;
      // Citação (Item 1c): rebaixa error → warning.
      const inQuote = isInsideQuoteOrCitation(corpo, idx);
      out.push({
        code: "LEXICO_PROIBIDO", severity: inQuote ? "warning" : "error",
        excerpt: excerptAt(corpo, Math.max(0, idx - 40), idx + term.length + 60),
        hint: inQuote
          ? `O termo "${term}" aparece em CITAÇÃO LITERAL no corpo. Confirme que a citação (norma/súmula) é pertinente à ação "${acaoTipo}"; se for tese própria, remova.`
          : `O termo "${term}" é INCOMPATÍVEL com a ação do tipo "${acaoTipo}". Remova o trecho/tese e mantenha apenas a linha argumentativa correta para este tipo de ação.`,
      });
    }
  }
  return out;
}

// ─── Check 5: consistência interna do cálculo (warning) ─────────────────────

// Lê a linha CALC_JSON gravada pelo bloco 1 dentro do FATOS_FIXADOS. O check é
// SÓ de aritmética interna (regra de negócio: o indébito ancora no período
// coberto pelo documento de cálculo — NUNCA comparar com a data corrente).
function checkCalcConsistency(fixedFacts: string | null | undefined): MechViolation[] {
  const out: MechViolation[] = [];
  if (!fixedFacts) return out;
  const m = fixedFacts.match(/CALC_JSON\s*:?\s*(\{[\s\S]*?\})/);
  if (!m) return out;
  let calc: Record<string, unknown>;
  try { calc = JSON.parse(m[1]); } catch { return out; }
  const num = (k: string): number | null => {
    const v = calc[k];
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
  };
  const parcelas = num("parcelas_computadas");
  const valorMensal = num("valor_mensal");
  const indebito = num("indebito_total");
  const dobro = num("dobro");
  const danosMorais = num("danos_morais");
  const valorCausa = num("valor_causa");
  const fmt = (c: number) => "R$ " + (c / 100).toFixed(2).replace(".", ",");

  if (parcelas !== null && valorMensal !== null && indebito !== null &&
      Math.abs(parcelas * valorMensal - indebito) > 1) {
    out.push({
      code: "CALC_INCONSISTENTE", severity: "warning",
      excerpt: `parcelas=${parcelas} × mensal=${fmt(valorMensal)} ≠ indébito=${fmt(indebito)}`,
      hint: `Aritmética interna divergente: ${parcelas} parcelas × ${fmt(valorMensal)} = ${fmt(parcelas * valorMensal)}, mas o indébito declarado é ${fmt(indebito)}. Conferir a memória de cálculo (o indébito ancora no período coberto pelo documento de cálculo).`,
    });
  }
  if (indebito !== null && dobro !== null && Math.abs(dobro - 2 * indebito) > 1) {
    out.push({
      code: "CALC_INCONSISTENTE", severity: "warning",
      excerpt: `dobro=${fmt(dobro)} ≠ 2 × indébito=${fmt(indebito)}`,
      hint: `A repetição em dobro (${fmt(dobro)}) não é 2 × o indébito (${fmt(indebito)} → esperado ${fmt(2 * indebito)}). Conferir.`,
    });
  }
  if (dobro !== null && danosMorais !== null && valorCausa !== null &&
      Math.abs(valorCausa - (dobro + danosMorais)) > 1) {
    out.push({
      code: "CALC_INCONSISTENTE", severity: "warning",
      excerpt: `valor_causa=${fmt(valorCausa)} ≠ dobro+danos=${fmt(dobro + danosMorais)}`,
      hint: `O valor da causa (${fmt(valorCausa)}) não fecha com dobro (${fmt(dobro)}) + danos morais (${fmt(danosMorais)}) = ${fmt(dobro + danosMorais)}. Conferir.`,
    });
  }
  return out;
}

// ─── Check 6: súmulas fora do catálogo (POR TRIBUNAL) ─────────────────────────

// V25.2 (Item 1): catálogo de pares (tribunal:numero). Um número solto é
// ambíguo — só é válido COM o tribunal (Súmula 13 é do TJBA; Súmula 530 é do
// STJ). Os enunciados literais constam do prompt do agente; aqui só autorizamos
// a CITAÇÃO do par tribunal+número.
const SUMULAS_CATALOGO = new Set([
  "stj:43", "stj:54", "stj:297", "stj:362", "stj:382", "stj:479", "stj:530",
  "stf:596",
  "tjba:13",
]);
const SUMULAS_CATALOGO_LABEL = "STJ 43,54,297,362,382,479,530; STF 596; TJBA 13";

// Resolve o nome do tribunal que segue a citação (texto já vem folded: lower,
// sem acento). Vazio = não identificado.
function normTribunal(raw: string): string {
  if (/tjba|tribunal de justica da bahia|tj\s*-?\s*ba\b/.test(raw)) return "tjba";
  if (/stf|supremo/.test(raw)) return "stf";
  if (/stj|superior tribunal de justica/.test(raw)) return "stj";
  return "";
}

function checkSumulas(text: string): MechViolation[] {
  const out: MechViolation[] = [];
  const f = fold(text);
  // Captura o número e, opcionalmente, o tribunal que o segue (até ~40 chars).
  const re = /sumula\s+(?:n[o.º°]?\s*\.?\s*)?(\d{1,4})(\s+(?:do|da|de|dos|das)\s+[a-z. ]{2,40})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f)) !== null) {
    const n = Number(m[1]);
    // Ausência de tribunal → STJ por padrão (default histórico), mas o par
    // resultante ainda precisa estar no catálogo.
    const trib = normTribunal(m[2] || "") || "stj";
    if (SUMULAS_CATALOGO.has(`${trib}:${n}`)) continue;
    // Exceção: ocorrência dentro de um marcador [CONFERIR ...] não viola.
    const back = f.slice(Math.max(0, m.index - 200), m.index);
    const conf = back.lastIndexOf("[conferir");
    if (conf >= 0 && !back.slice(conf).includes("]")) continue;
    out.push({
      code: "SUMULA_FORA_CATALOGO", severity: "error",
      excerpt: excerptAt(text, Math.max(0, m.index - 30), m.index + m[0].length + 30),
      hint: `Súmula ${n} do ${trib.toUpperCase()} está FORA do catálogo permitido (${SUMULAS_CATALOGO_LABEL}). Remova a citação ou substitua por súmula do catálogo com enunciado correto.`,
    });
  }
  return out;
}

// ─── Check 7: coerência de datas vs início do contrato (V25.2 Item 2) ─────────
// Pega a alucinação de período do Haiku (ex.: "descontos de janeiro a março de
// 2025, anterior ao início do contrato em 05/09/2025"). Warning, não bloqueia.

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

interface YMD { ord: number; day: number | null; } // ord = ano*12 + (mes-1)
function ymd(year: number, month: number, day: number | null): YMD | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;
  if (day !== null && (day < 1 || day > 31)) return null;
  return { ord: year * 12 + (month - 1), day };
}
// Anterior ESTRITO. Sem dia para desempatar no mesmo mês → não considera anterior.
function isBeforeYMD(a: YMD, b: YMD): boolean {
  if (a.ord !== b.ord) return a.ord < b.ord;
  if (a.day !== null && b.day !== null) return a.day < b.day;
  return false;
}
function fmtYMD(d: YMD): string {
  const year = Math.floor(d.ord / 12);
  const mm = String((d.ord % 12) + 1).padStart(2, "0");
  return d.day !== null ? `${String(d.day).padStart(2, "0")}/${mm}/${year}` : `${mm}/${year}`;
}

// Primeira data (numérica DD/MM/AAAA ou extenso "DD de mês de AAAA"/"mês de AAAA")
// num segmento já folded.
function parseDateInSegment(seg: string): YMD | null {
  let m = seg.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = seg.match(/(?:(\d{1,2})\s+de\s+)?([a-z]+)\s+de\s+(\d{4})/);
  if (m && MESES_PT[m[2]] !== undefined) return ymd(+m[3], MESES_PT[m[2]], m[1] ? +m[1] : null);
  return null;
}

// Início do contrato: 1º do fixedFacts (data de início/vigência), senão do corpo.
function findContractStart(f: string, ff: string): YMD | null {
  const re = /(inicio|vigencia|firmad[oa]|celebrad[oa]|iniciad[oa]|contratad[oa]|data de contrata)/g;
  for (const src of [ff, f]) {
    if (!src) continue;
    re.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(src)) !== null) {
      const d = parseDateInSegment(src.slice(mm.index, mm.index + 70));
      if (d) return d;
    }
  }
  return null;
}

function checkDataAnteriorContrato(text: string, fixedFacts: string | null | undefined): MechViolation[] {
  const f = fold(text);
  const ff = fixedFacts ? fold(fixedFacts) : "";
  const contractStart = findContractStart(f, ff);
  if (!contractStart) return []; // tolerância: sem referência, não roda
  const out: MechViolation[] = [];
  const DESC = /(desconto|parcela|indebito|planilha)/;
  const JURIS = /(resp|agint|aresp|recurso especial|sumula|tribunal|\bstj\b|\bstf\b|tjba|cnj|\d{7}-\d{2}\.\d{4})/;
  const seenLines = new Set<number>(); // 1 warning por linha
  const emit = (idx: number, d: YMD | null) => {
    if (!d || !isBeforeYMD(d, contractStart)) return;
    const lineStart = f.lastIndexOf("\n", idx) + 1;
    if (seenLines.has(lineStart)) return;
    const win = f.slice(Math.max(0, idx - 120), Math.min(f.length, idx + 120));
    if (!DESC.test(win)) return; // só janelas de desconto/parcela/indébito/planilha
    if (JURIS.test(f.slice(Math.max(0, idx - 50), idx + 50))) return; // pula jurisprudência/fecho
    seenLines.add(lineStart);
    const winStart = Math.max(0, idx - 100), winEnd = Math.min(text.length, idx + 100);
    out.push({
      code: "DATA_ANTERIOR_AO_CONTRATO", severity: "warning",
      excerpt: excerptAt(text, winStart, winEnd, 140),
      hint: `Há menção a desconto/parcela/indébito em data anterior ao início do contrato (referência: ${fmtYMD(contractStart)}). Lançamentos anteriores ao início do contrato não pertencem a ele — confira o cruzamento de vigência e o período do indébito.`,
    });
  };
  // Período "mês a mês de AAAA" (usa o mês inicial do intervalo).
  let m: RegExpExecArray | null;
  const rePeriodo = /([a-z]+)\s+a\s+([a-z]+)\s+de\s+(\d{4})/g;
  while ((m = rePeriodo.exec(f)) !== null) {
    const mes1 = MESES_PT[m[1]];
    if (mes1 !== undefined) emit(m.index, ymd(+m[3], mes1, null));
  }
  // Extenso "DD de mês de AAAA" ou "mês de AAAA".
  const reExt = /(?:(\d{1,2})\s+de\s+)?([a-z]+)\s+de\s+(\d{4})/g;
  while ((m = reExt.exec(f)) !== null) {
    const mes = MESES_PT[m[2]];
    if (mes !== undefined) emit(m.index, ymd(+m[3], mes, m[1] ? +m[1] : null));
  }
  // Numérico DD/MM/AAAA.
  const reNum = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  while ((m = reNum.exec(f)) !== null) emit(m.index, ymd(+m[3], +m[2], +m[1]));
  return out;
}

// ─── orquestração do validador ───────────────────────────────────────────────

export function runMechanicalValidator(peca: string, ctx: MechContext = {}): MechViolation[] {
  if (!peca || !peca.trim()) return [];
  const out: MechViolation[] = [];
  out.push(...checkNumeralExtenso(peca));            // Check 1
  out.push(...checkInvariantesEscritorio(peca));     // Check 2
  out.push(...checkSinteseVsCorpo(peca));            // Check 3
  out.push(...checkLexicoProibido(peca, ctx.acaoTipo)); // Check 4
  out.push(...checkCalcConsistency(ctx.fixedFacts)); // Check 5
  out.push(...checkSumulas(peca));                   // Check 6
  out.push(...checkDataAnteriorContrato(peca, ctx.fixedFacts)); // Check 7 (V25.2)
  return out;
}

// Feedback objetivo para devolver ao N3 (loop de correção existente).
export function formatViolationsFeedback(violations: MechViolation[]): string {
  const lines = violations.map((v, i) =>
    `${i + 1}. [${v.code}] ${v.hint}\n   Trecho: "${v.excerpt}"`);
  return "VIOLAÇÕES DETECTADAS PELO VALIDADOR MECÂNICO (correção OBRIGATÓRIA — checks determinísticos, não há falso positivo):\n" +
    lines.join("\n") +
    "\nReescreva a peça corrigindo TODAS as violações acima, sem alterar o que está correto.";
}

// Checklist de pendências (warnings e erros remanescentes) anexado ao final da peça.
export function formatWarningsChecklist(violations: MechViolation[]): string {
  if (!violations.length) return "";
  const lines = violations.map((v) =>
    `- [${v.severity === "error" ? "REVISAR" : "CONFERIR"}] (${v.code}) ${v.hint}${v.excerpt ? ` — trecho: "${v.excerpt}"` : ""}`);
  return "\n\n---\n_CHECKLIST DO VALIDADOR MECÂNICO:_\n" + lines.join("\n");
}
