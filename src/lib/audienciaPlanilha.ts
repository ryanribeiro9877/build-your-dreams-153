/* ============================================================
   Card 13 · 3.1 — parse da planilha de audiências do Dr. Rodrigo
   ============================================================
   Funções PURAS (nenhum acesso a rede/banco), para o parse rodar no cliente antes
   de montar o lote de `importar_audiencias_planilha`.

   A planilha real tem 22 abas (jan/2025 → jan/2027), ~500 audiências/mês, e duas
   convenções que precisam ser desfeitas:

     · o cliente vem como "CLIENTE x RÉU" na mesma célula;
     · a data vem em português corrido: "dia 6 de Março de 2025 às 09:00".

   FUSO: o Brasil não tem horário de verão desde 2019 e a Bahia é UTC-03:00 o ano
   todo, então o offset é fixo. Gravar sem offset seria pior que fixá-lo: o
   timestamptz assumiria o fuso do servidor (UTC) e toda audiência entraria 3h
   adiantada — 09:00 viraria 06:00.
============================================================ */

export const FUSO_BRASIL = "-03:00";

/** Offsets default dos lembretes, confirmados pelo Rodrigo (item 4.3). */
export const OFFSETS_LEMBRETE_DEFAULT = [7, 3, 1, 0];

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Minúsculas sem acento — "Março" e "MARCO" caem na mesma chave. */
function dobrar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Separa "CLIENTE x RÉU" em cliente e parte contrária.
 *
 * O separador é um "x" SOLTO (cercado de espaço), nunca o "x" dentro de palavra —
 * senão "XAVIER x BANCO" perderia a primeira letra e "FELIX" viraria "FE"/"IX".
 * Aceita também "×" (multiplicação), "vs" e "versus", que aparecem misturados na
 * planilha. Sem separador, tudo é cliente e a parte contrária fica nula: chutar
 * uma divisão seria inventar réu.
 */
export function separarPartes(celula: unknown): { cliente: string; parte_contraria: string | null } {
  const txt = String(celula ?? "").replace(/\s+/g, " ").trim();
  if (!txt) return { cliente: "", parte_contraria: null };

  const m = /^(.*?)\s+(?:x|×|vs\.?|versus)\s+(.*)$/i.exec(txt);
  if (!m) return { cliente: txt, parte_contraria: null };

  const cliente = m[1].trim();
  const contraria = m[2].trim();
  // Um dos lados vazio significa separador na borda ("x BANCO", "MARIA x"):
  // não é uma divisão confiável.
  if (!cliente || !contraria) return { cliente: txt, parte_contraria: null };
  return { cliente, parte_contraria: contraria };
}

/**
 * Converte a data em português corrido para ISO com offset do Brasil.
 * Devolve null quando não reconhece — o item vai para o relatório de parse em vez
 * de entrar no lote com data adivinhada.
 *
 * Formatos aceitos (os que aparecem na planilha):
 *   "dia 6 de Março de 2025 às 09:00"   ·  "6 de março de 2025 as 9h"
 *   "1º de Abril de 2026 às 14h30"      ·  "06/03/2025 09:00"
 *   "06/03/2025" (sem hora → 00:00)     ·  já-ISO "2025-03-06T09:00:00-03:00"
 */
export function parseDataHoraBR(valor: unknown): string | null {
  const cru = String(valor ?? "").trim();
  if (!cru) return null;

  // Já vem ISO (a aba pode ter data de verdade, que o leitor entrega serializada).
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(cru);
  if (iso) {
    const [, a, mes, d, h, mi] = iso;
    return `${a}-${mes}-${d}T${h}:${mi}:00${FUSO_BRASIL}`;
  }

  const t = dobrar(cru);
  const hora = extrairHora(t);

  // "dia 6 de marco de 2025", "1o de abril de 2026", "6 marco 2025"
  const porNome = /(\d{1,2})\s*(?:o|a|º|ª)?\s*(?:de\s+)?([a-z]{3,9})\.?\s*(?:de\s+)?(\d{4})/.exec(t);
  if (porNome) {
    const dia = Number(porNome[1]);
    const mes = MESES[porNome[2]];
    const ano = Number(porNome[3]);
    if (mes && validar(dia, mes, ano)) {
      return `${ano}-${p2(mes)}-${p2(dia)}T${p2(hora.h)}:${p2(hora.m)}:00${FUSO_BRASIL}`;
    }
  }

  // "06/03/2025" ou "6-3-25"
  const numerico = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(t);
  if (numerico) {
    const dia = Number(numerico[1]);
    const mes = Number(numerico[2]);
    let ano = Number(numerico[3]);
    if (ano < 100) ano += 2000;
    if (validar(dia, mes, ano)) {
      return `${ano}-${p2(mes)}-${p2(dia)}T${p2(hora.h)}:${p2(hora.m)}:00${FUSO_BRASIL}`;
    }
  }

  return null;
}

/** "às 09:00", "as 9h", "14h30", "às 9". Sem hora reconhecida → meia-noite. */
function extrairHora(t: string): { h: number; m: number } {
  const comMin = /(?:as\s+)?(\d{1,2})\s*(?::|h)\s*(\d{2})/.exec(t);
  if (comMin) {
    const h = Number(comMin[1]);
    const m = Number(comMin[2]);
    if (h <= 23 && m <= 59) return { h, m };
  }
  const soHora = /(?:as\s+)(\d{1,2})(?:\s*h)?(?!\d)/.exec(t) ?? /(\d{1,2})\s*h(?!\d)/.exec(t);
  if (soHora) {
    const h = Number(soHora[1]);
    if (h <= 23) return { h, m: 0 };
  }
  return { h: 0, m: 0 };
}

/** Data existe de verdade no calendário (barra 31/02 e afins). */
function validar(dia: number, mes: number, ano: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2000 || ano > 2100) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCDate() === dia && d.getUTCMonth() === mes - 1 && d.getUTCFullYear() === ano;
}

export interface ItemAudiencia {
  cliente: string;
  parte_contraria: string | null;
  data_hora: string;
  tipo_acao: string | null;
  processo_numero: string | null;
  observacao: string | null;
  origem: string;
}

export interface LinhaDescartada {
  linha: number;
  motivo: string;
  valores: string[];
}

/**
 * Mapa coluna→índice detectado pelo cabeçalho. Só SUGERE: o fluxo da tela exige
 * confirmação humana com amostra antes de importar (nenhum palpite silencioso de
 * coluna — a lição do Card 1).
 */
export function detectarColunas(cabecalho: unknown[]): Record<string, number> {
  // Ordem = PRIORIDADE. "Processo x Réu" (como o Rodrigo às vezes titula a coluna
  // das partes) casa tanto em `partes` quanto em `processo_numero`; quem vem
  // primeiro leva, e a coluna sai da disputa — sem isso, duas chaves apontariam
  // para o MESMO índice e o número do processo viria com o nome do cliente dentro.
  // `n[ºo°.\s]*` cobre "Nº do processo", que a normalização sem acento entrega
  // como "no do processo" (o "º" some).
  const REGRAS: [string, RegExp][] = [
    ["partes", /(cliente|parte|processo\s*x|autor)/],
    ["data", /(data|dia|audiencia|horario)/],
    ["tipo_acao", /(tipo|acao|tese|assunto|objeto)/],
    ["processo_numero", /(n[ºo°.\s]*\s*(do\s+)?processo|numero\s+(do\s+)?processo|^processo$|autos)/],
    ["observacao", /(obs|observ|nota)/],
  ];

  const mapa: Record<string, number> = {};
  const usadas = new Set<number>();
  cabecalho.forEach((celula, i) => {
    const h = dobrar(String(celula ?? ""));
    if (!h || usadas.has(i)) return;
    for (const [chave, re] of REGRAS) {
      if (mapa[chave] === undefined && re.test(h)) {
        mapa[chave] = i;
        usadas.add(i);
        return;
      }
    }
  });
  return mapa;
}

/**
 * Monta o lote a partir das linhas da aba. `origem` identifica de onde veio (a RPC
 * usa para deduplicar/auditar) — ex.: "Tabela de audiências / Agosto".
 *
 * Linha sem partes OU sem data reconhecida NÃO entra no lote: vai para
 * `descartadas` com o motivo, para a tela mostrar antes de confirmar. Importar
 * audiência com data adivinhada é pior que não importar.
 */
export function montarLoteAudiencias(
  linhas: unknown[][],
  colunas: Record<string, number>,
  origem: string,
): { itens: ItemAudiencia[]; descartadas: LinhaDescartada[] } {
  const itens: ItemAudiencia[] = [];
  const descartadas: LinhaDescartada[] = [];

  linhas.forEach((linha, idx) => {
    const cel = (k: string): string => {
      const i = colunas[k];
      return i === undefined ? "" : String(linha[i] ?? "").trim();
    };
    const brutoPartes = cel("partes");
    const brutoData = cel("data");

    // Linha totalmente vazia é separador visual da planilha, não erro: ignora
    // sem poluir o relatório.
    if (!brutoPartes && !brutoData && linha.every((c) => !String(c ?? "").trim())) return;

    const { cliente, parte_contraria } = separarPartes(brutoPartes);
    const dataHora = parseDataHoraBR(brutoData);

    if (!cliente) {
      descartadas.push({ linha: idx + 1, motivo: "sem cliente", valores: linha.map((c) => String(c ?? "")) });
      return;
    }
    if (!dataHora) {
      descartadas.push({
        linha: idx + 1,
        motivo: brutoData ? `data não reconhecida: "${brutoData}"` : "sem data",
        valores: linha.map((c) => String(c ?? "")),
      });
      return;
    }

    itens.push({
      cliente,
      parte_contraria,
      data_hora: dataHora,
      tipo_acao: cel("tipo_acao") || null,
      processo_numero: cel("processo_numero") || null,
      observacao: cel("observacao") || null,
      origem,
    });
  });

  return { itens, descartadas };
}
