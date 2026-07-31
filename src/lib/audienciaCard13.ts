/* ============================================================
   Card 13 — lógica PURA dos três incrementos de Audiências
   ============================================================
   (3.1) importação em massa da planilha · (3.2) régua de lembretes ·
   (3.3) preparação da audiência.

   Nada aqui toca rede/banco (por isso é testável). Os nomes de chave e TODO
   valor de `motivo` saíram de `pg_get_functiondef` em 30/07/2026 das três RPCs:

     importar_audiencias_planilha(p_lote jsonb, p_offsets integer[], p_dry_run boolean)
     registrar_lembrete_audiencia(p_lembrete_id uuid, p_status text, p_observacao text)
     preparar_audiencia(p_audiencia_id uuid)

   Motivos que EXISTEM: `status_invalido` e `lembrete_nao_encontrado`
   (registrar_lembrete_audiencia) e `audiencia_nao_encontrada`
   (preparar_audiencia). `importar_audiencias_planilha` nunca devolve ok:false —
   ou levanta 42501, ou volta ok:true com os contadores. Não há
   `desfecho_invalido` nem `protocolo_obrigatorio` nestes cards.

   O vocabulário de status/canal do lembrete vive em src/lib/p2.ts
   (LEMBRETE_STATUS_META, com o campo `encerra`) — não é redeclarado aqui.
============================================================ */

import { detectarColunas } from "@/lib/audienciaPlanilha";
import { DOCUMENT_TYPE_LABELS } from "@/components/clients/shared";

/* ─── erro cru de RPC ─────────────────────────────────────────────────────── */

export interface ErroRpc { code?: string; message?: string }

/**
 * Toda falha diz o que NÃO foi feito. 42501 (RLS/gate) vira "você não tem
 * acesso" — nunca lista vazia nem silêncio, que o usuário leria como "não tem
 * nada aqui".
 */
export function traduzirErroRpc(err: ErroRpc | null | undefined, oQueNaoFoiFeito: string): string {
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  if (code === "42501" || msg.includes("42501") || msg.includes("permiss") || msg.includes("restrita")) {
    return `${oQueNaoFoiFeito}: você não tem acesso (seu perfil não gerencia audiências).`;
  }
  if (code === "22007" || msg.includes("invalid input syntax for type date")) {
    return `${oQueNaoFoiFeito}: data em formato inválido.`;
  }
  if (msg.includes("jwt") || msg.includes("autenticado")) {
    return `${oQueNaoFoiFeito}: sessão expirada. Entre novamente.`;
  }
  return `${oQueNaoFoiFeito}: ${err?.message ?? "falha desconhecida no servidor"}.`;
}

/* ─── 3.2 régua de lembretes ──────────────────────────────────────────────── */

export interface LembreteRow {
  id: string;
  audiencia_id: string;
  data_prevista: string; // date (YYYY-MM-DD)
  canal: string;
  status: string;
  observacao: string | null;
  feito_em: string | null;
  pendencia_task_id: string | null;
}

export interface RegistrarLembreteRet {
  ok: boolean;
  motivo?: string;
  mensagem?: string;
  lembrete_id?: string;
  status?: string;
  pendencia_encerrada?: boolean;
  nota?: string | null;
}

/** ok:false de registrar_lembrete_audiencia — os DOIS motivos que o corpo tem. */
const LEMBRETE_MOTIVOS: Record<string, string> = {
  status_invalido: "o status enviado não é aceito (use Feito, Não atendeu ou Cancelar)",
  lembrete_nao_encontrado: "este lembrete não existe mais (pode ter sido apagado por outra pessoa)",
};

/** "Lembrete NÃO registrado: …" — usa a `mensagem` da RPC quando ela vem. */
export function traduzirFalhaLembrete(motivo?: string, mensagem?: string): string {
  const conhecido = motivo ? LEMBRETE_MOTIVOS[motivo] : undefined;
  const detalhe = conhecido ?? mensagem ?? motivo ?? "motivo não informado pelo servidor";
  return `Lembrete NÃO registrado: ${detalhe}.`;
}

/**
 * Texto do resultado de sucesso.
 *
 * MEDIDO no corpo da RPC: `pendencia_encerrada` é DERIVADO —
 * `(status IN ('feito','cancelado') AND pendencia_task_id IS NOT NULL)`. O UPDATE
 * na tarefa tem `WHERE completed_at IS NULL AND cancelled_at IS NULL`, então a
 * flag vem `true` mesmo quando NENHUMA linha foi atualizada (tarefa já concluída,
 * já cancelada, ou fora do alcance). Por isso a UI não afirma "pendência fechada":
 * relata o que o banco devolveu e diz que é indicador derivado.
 */
export function textoResultadoLembrete(res: RegistrarLembreteRet): string {
  const encerra = res.status === "feito" || res.status === "cancelado";
  const base = res.status === "nao_atendeu"
    ? "Lembrete registrado como NÃO ATENDEU — a pendência permanece ABERTA para nova tentativa."
    : `Lembrete registrado como ${res.status === "feito" ? "FEITO" : "CANCELADO"}.`;
  const nota = res.nota ? ` ${res.nota}` : "";
  if (encerra && res.pendencia_encerrada) {
    return `${base}${nota} O banco devolveu pendencia_encerrada=true, mas esse indicador é DERIVADO ` +
      "(status + existência da tarefa): ele não confirma que a tarefa vinculada foi de fato fechada.";
  }
  if (encerra && !res.pendencia_encerrada) {
    return `${base}${nota} Não havia tarefa (tickler) vinculada a este lembrete — nada a encerrar.`;
  }
  return `${base}${nota}`;
}

/**
 * Rótulo de urgência do lembrete pela `data_prevista` (coluna `date`).
 *
 * A régua serve para responder "quem eu ligo HOJE", então o dia relativo importa
 * mais que a data. Comparação feita em partes de data LOCAIS: `new Date("2026-07-30")`
 * seria meia-noite UTC e, no fuso -03, voltaria como dia 29 — o "hoje" apareceria
 * como "atrasado 1 dia". `encerrado` tira o vermelho de atraso: lembrete já
 * resolvido não é cobrança pendente.
 */
export function rotuloDiasLembrete(
  dataPrevista: string,
  encerrado: boolean,
  hoje: Date = new Date(),
): { dias: number; texto: string; cls: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataPrevista ?? ""));
  if (!m) return { dias: Number.NaN, texto: "sem data", cls: "n" };
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((alvo.getTime() - base.getTime()) / 86400000);
  if (encerrado) {
    if (dias === 0) return { dias, texto: "hoje", cls: "n" };
    return { dias, texto: dias > 0 ? `em ${dias} dia(s)` : `há ${-dias} dia(s)`, cls: "n" };
  }
  if (dias === 0) return { dias, texto: "hoje", cls: "p" };
  if (dias < 0) return { dias, texto: `atrasado ${-dias} dia(s)`, cls: "d" };
  return { dias, texto: `em ${dias} dia(s)`, cls: "n" };
}

/* ─── 3.3 preparação ──────────────────────────────────────────────────────── */

export interface PreparacaoRet {
  ok: boolean;
  motivo?: string;
  cliente?: string | null;
  cliente_vinculado?: boolean;
  data_hora?: string;
  tipo_acao?: string | null;
  parte_contraria?: string | null;
  local_ou_link?: string | null;
  status?: string;
  tese_resolvida?: boolean;
  tese_resolvida_via?: string | null;
  tese?: string | null;
  documentos_esperados?: string[];
  documentos_presentes?: string[];
  documentos_faltando?: string[];
  lembretes?: { id: string; data: string; status: string }[];
  limitacao?: string;
}

/** Único ok:false de preparar_audiencia. */
export function traduzirFalhaPreparacao(motivo?: string): string {
  if (motivo === "audiencia_nao_encontrada") {
    return "Preparação NÃO gerada: audiência não encontrada (pode ter sido excluída ou você não tem acesso a ela).";
  }
  return `Preparação NÃO gerada: ${motivo ?? "motivo não informado pelo servidor"}.`;
}

/** Como a tese foi encontrada. `null` = não foi encontrada (ver o aviso abaixo). */
export const TESE_VIA_LABELS: Record<string, string> = {
  processo: "pelo processo vinculado (tipo_acao_id do processo)",
  nome_exato: "pelo nome/código exato do tipo de ação",
  apelido: "por apelido cadastrado em tipo_acao_apelidos",
};
export function teseViaLabel(via: string | null | undefined): string {
  if (!via) return "não resolvida";
  return TESE_VIA_LABELS[via] ?? via;
}

/**
 * AVISO obrigatório quando a tese não casou.
 *
 * MEDIDO: sem tese, `tipo_acao_ancora_docs` não devolve nada e a lista de
 * documentos esperados fica só com `['procuracao']` (a RPC concatena a procuração
 * sempre). Ou seja: a tela mostra 1 documento e, se a procuração estiver anexada,
 * PARECE 100% completa. Sem este aviso a tela mente sobre a preparação.
 */
export function avisoTeseNaoResolvida(res: PreparacaoRet): string | null {
  if (res.tese_resolvida) return null;
  const tipo = (res.tipo_acao ?? "").trim();
  return (
    `O tipo de ação ${tipo ? `"${tipo}"` : "desta audiência"} NÃO casou com nenhuma tese cadastrada. ` +
    "A lista de documentos abaixo NÃO é a lista da tese: ela tem apenas a procuração, " +
    "então ela pode parecer completa sem estar. Para corrigir, cadastre um apelido " +
    "desse tipo de ação em tipo_acao_apelidos (ou vincule o processo à audiência)."
  );
}

/** Rótulo humano do código de documento (fonte única: DOCUMENT_TYPE_LABELS). */
export function docLabel(code: string): string {
  return DOCUMENT_TYPE_LABELS[code] ?? code;
}

/**
 * Semáforo dos documentos. Cliente NÃO vinculado é o pior caso e vem primeiro:
 * a RPC monta `documentos_faltando` com `a.client_id IS NULL OR NOT EXISTS(...)`,
 * logo TUDO aparece faltando — o que não significa que o cliente não tenha os
 * documentos, só que não há vínculo para conferir.
 */
export function semaforoDocumentos(res: PreparacaoRet): { cls: string; texto: string } {
  const esperados = res.documentos_esperados ?? [];
  const faltando = res.documentos_faltando ?? [];
  if (res.cliente_vinculado === false) {
    return {
      cls: "d",
      texto: "Audiência sem cliente vinculado: nenhum documento pode ser conferido, " +
        "por isso todos aparecem como faltando. Vincule o cliente para valer.",
    };
  }
  if (esperados.length === 0) return { cls: "n", texto: "Nenhum documento esperado calculado." };
  if (faltando.length === 0) {
    return { cls: "ok", texto: `Todos os ${esperados.length} documento(s) esperado(s) estão presentes.` };
  }
  return { cls: "d", texto: `Faltam ${faltando.length} de ${esperados.length} documento(s).` };
}

/* ─── 3.1 importação em massa ─────────────────────────────────────────────── */

export interface ImportacaoRet {
  ok: boolean;
  motivo?: string;
  dry_run?: boolean;
  audiencias_criadas?: number;
  duplicadas_ignoradas?: number;
  sem_match_cliente?: number;
  nome_ambiguo?: number;
  audiencias_passadas?: number;
  lembretes_criados?: number;
  offsets_usados?: number[];
  erros?: { cliente?: string; erro?: string }[];
  nota?: string;
}

/** Limites dos offsets: dia da audiência (0) até um ano antes. */
export const OFFSET_MIN = 0;
export const OFFSET_MAX = 365;

/**
 * Lê o campo de offsets ("7, 3, 1, 0") em integer[] para `p_offsets`.
 * Rejeita em vez de "consertar": offset inventado gera tickler na data errada.
 * Ordena decrescente (do mais distante ao dia da audiência) e remove repetido —
 * o índice único (audiencia_id, data_prevista, canal) já ignoraria a duplicata,
 * mas o contador `lembretes_criados` da RPC contaria duas vezes e o ensaio
 * mentiria no número.
 */
export function parsearOffsets(txt: string): { offsets: number[]; erro: string | null } {
  const brutos = String(txt ?? "").split(/[^\d-]+/).filter((s) => s !== "");
  if (brutos.length === 0) {
    return { offsets: [], erro: "Informe ao menos um offset (ex.: 7, 3, 1, 0)." };
  }
  const vistos = new Set<number>();
  for (const b of brutos) {
    const n = Number(b);
    if (!Number.isInteger(n) || n < OFFSET_MIN || n > OFFSET_MAX) {
      return { offsets: [], erro: `Offset inválido: "${b}". Use inteiros entre ${OFFSET_MIN} e ${OFFSET_MAX}.` };
    }
    vistos.add(n);
  }
  return { offsets: Array.from(vistos).sort((a, b) => b - a), erro: null };
}

/** Compara offsets ignorando ordem (o que importa é o conjunto de datas). */
export function mesmosOffsets(a: number[] | undefined, b: number[] | undefined): boolean {
  const x = [...(a ?? [])].sort((m, n) => m - n);
  const y = [...(b ?? [])].sort((m, n) => m - n);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * O botão de confirmar só existe depois de um ENSAIO válido.
 *
 * Exige o ensaio com `dry_run === true` (o eco da própria RPC, não a nossa
 * intenção) e os MESMOS offsets: se o usuário mexeu nos offsets depois do ensaio,
 * a confirmação criaria uma grade de lembretes diferente da que foi conferida.
 */
export function ensaioLiberaConfirmacao(
  ensaio: ImportacaoRet | null,
  offsetsAtuais: number[],
): { libera: boolean; bloqueio: string | null } {
  if (!ensaio) return { libera: false, bloqueio: "Faça o ensaio (dry-run) antes de importar." };
  if (!ensaio.ok) return { libera: false, bloqueio: "O ensaio falhou; corrija antes de importar." };
  if (ensaio.dry_run !== true) {
    return { libera: false, bloqueio: "O último retorno não foi de ensaio. Refaça o ensaio." };
  }
  if (!mesmosOffsets(ensaio.offsets_usados, offsetsAtuais)) {
    return { libera: false, bloqueio: "Os offsets mudaram depois do ensaio. Refaça o ensaio." };
  }
  if ((ensaio.audiencias_criadas ?? 0) === 0) {
    return { libera: false, bloqueio: "O ensaio não encontrou nenhuma audiência nova para criar." };
  }
  return { libera: true, bloqueio: null };
}

export interface LinhaResumo {
  chave: string;
  label: string;
  valor: number;
  cls: string;      // classe do .cli-chip (ok|p|d|n)
  explica: string;
}

/**
 * Contadores do retorno em linhas para a tela. Os rótulos dizem o DESTINO da
 * linha, não só o número — `sem_match_cliente` e `nome_ambiguo` NÃO descartam a
 * audiência (a RPC insere com `client_name` e sem vínculo), e rotulá-los como
 * "ignoradas" seria mentira.
 */
export function resumoImportacao(res: ImportacaoRet): LinhaResumo[] {
  const ensaio = res.dry_run === true;
  const n = (v: number | undefined) => v ?? 0;
  const linhas: LinhaResumo[] = [
    {
      chave: "audiencias_criadas",
      label: ensaio ? "Audiências que serão criadas" : "Audiências criadas",
      valor: n(res.audiencias_criadas), cls: "ok",
      explica: ensaio ? "Nada foi gravado ainda — este é o ensaio." : "Gravadas em audiencias com status 'marcada'.",
    },
    {
      chave: "duplicadas_ignoradas",
      label: "Duplicadas ignoradas",
      valor: n(res.duplicadas_ignoradas), cls: "n",
      explica: "Já existe audiência da mesma pessoa no mesmo instante. Estas são puladas.",
    },
    {
      chave: "sem_match_cliente",
      label: "Sem cliente cadastrado",
      valor: n(res.sem_match_cliente), cls: "p",
      explica: "NÃO são descartadas: entram só com o nome digitado, sem vínculo com o cadastro.",
    },
    {
      chave: "nome_ambiguo",
      label: "Nome ambíguo",
      valor: n(res.nome_ambiguo), cls: "p",
      explica: "Mais de um cliente com o mesmo nome. Entram sem vínculo (o sistema não escolhe por você).",
    },
    {
      chave: "audiencias_passadas",
      label: "Já passaram",
      valor: n(res.audiencias_passadas), cls: "n",
      explica: "Entram no histórico, mas não geram lembrete (avisar de audiência passada seria ruído).",
    },
    {
      chave: "lembretes_criados",
      label: ensaio ? "Lembretes (tickler) que serão criados" : "Lembretes (tickler) criados",
      valor: n(res.lembretes_criados), cls: "ok",
      explica: "Um por offset, só para datas a partir de hoje.",
    },
  ];
  const erros = res.erros?.length ?? 0;
  if (erros > 0) {
    linhas.push({
      chave: "erros", label: "Linhas com erro no banco", valor: erros, cls: "d",
      explica: "O servidor recusou estas linhas individualmente; o resto do lote seguiu.",
    });
  }
  return linhas;
}

/* ─── planilha: cabeçalho e colunas ──────────────────────────────────────── */

/** Chaves que `detectarColunas` reconhece, na ordem em que a tela as mostra. */
export const COLUNAS_ESPERADAS: { chave: string; label: string; obrigatoria: boolean }[] = [
  { chave: "partes", label: "Partes (CLIENTE x RÉU)", obrigatoria: true },
  { chave: "data", label: "Data e hora", obrigatoria: true },
  { chave: "tipo_acao", label: "Tipo de ação / tese", obrigatoria: false },
  { chave: "processo_numero", label: "Nº do processo", obrigatoria: false },
  { chave: "observacao", label: "Observação", obrigatoria: false },
];

/** 0 → "A", 25 → "Z", 26 → "AA" (a coluna como o Excel mostra). */
export function colunaLetra(indice: number): string {
  if (!Number.isInteger(indice) || indice < 0) return "?";
  let n = indice + 1;
  let out = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    out = String.fromCharCode(65 + resto) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Acha a linha de cabeçalho da aba.
 *
 * A planilha do Rodrigo tem título/mês nas primeiras linhas antes do cabeçalho
 * de verdade, e a posição varia por aba. Cabeçalho é a primeira linha (entre as
 * `limite` primeiras) em que `detectarColunas` encontra AS DUAS colunas sem as
 * quais não há audiência: partes e data. Devolve -1 quando não acha — a tela
 * então pede o número da linha em vez de adivinhar.
 */
export function detectarLinhaCabecalho(linhas: unknown[][], limite = 15): number {
  const teto = Math.min(linhas.length, limite);
  for (let i = 0; i < teto; i++) {
    const mapa = detectarColunas(linhas[i] ?? []);
    if (mapa.partes !== undefined && mapa.data !== undefined) return i;
  }
  return -1;
}

/** O que falta no mapa detectado para o lote poder ser montado. */
export function faltamColunasObrigatorias(mapa: Record<string, number>): string[] {
  return COLUNAS_ESPERADAS.filter((c) => c.obrigatoria && mapa[c.chave] === undefined).map((c) => c.label);
}

/**
 * Duas chaves apontando para a MESMA coluna.
 *
 * `detectarColunas` não deixa isso acontecer (marca a coluna como usada), mas a
 * tela permite corrigir o mapa à mão — e "partes" e "processo_numero" na mesma
 * coluna faria o número do processo sair com o nome do cliente dentro. Retorna os
 * rótulos envolvidos para a tela bloquear antes do ensaio.
 */
export function colunasDuplicadas(mapa: Record<string, number>): string[] {
  const porIndice = new Map<number, string[]>();
  for (const c of COLUNAS_ESPERADAS) {
    const i = mapa[c.chave];
    if (i === undefined) continue;
    const bucket = porIndice.get(i);
    if (bucket) bucket.push(c.label);
    else porIndice.set(i, [c.label]);
  }
  const conflitos: string[] = [];
  for (const [, labels] of porIndice) if (labels.length > 1) conflitos.push(labels.join(" + "));
  return conflitos;
}

/**
 * Número da linha COMO A PLANILHA MOSTRA.
 *
 * `montarLoteAudiencias` numera a partir das linhas de dados que recebeu (1 = a
 * primeira depois do cabeçalho). Reportar esse número ao usuário mandaria ele
 * olhar a linha errada da planilha; a soma devolve a linha real do Excel.
 * `linhaCabecalho` é índice 0-based (linha 1 da planilha = 0).
 */
export function linhaAbsoluta(linhaRelativa: number, linhaCabecalho: number): number {
  return linhaRelativa + linhaCabecalho + 1;
}

/** Agrupa as linhas descartadas por motivo (a planilha repete o mesmo motivo centenas de vezes). */
export function agruparDescartes(
  descartadas: { linha: number; motivo: string }[],
): { motivo: string; quantidade: number; linhas: number[] }[] {
  const mapa = new Map<string, number[]>();
  for (const d of descartadas) {
    // "data não reconhecida: "X"" viraria um grupo por valor; agrupa pelo prefixo
    // antes dos dois-pontos para o relatório caber na tela.
    const chave = d.motivo.includes(":") ? `${d.motivo.split(":")[0]}` : d.motivo;
    const bucket = mapa.get(chave);
    if (bucket) bucket.push(d.linha);
    else mapa.set(chave, [d.linha]);
  }
  return Array.from(mapa.entries())
    .map(([motivo, linhas]) => ({ motivo, quantidade: linhas.length, linhas }))
    .sort((a, b) => b.quantidade - a.quantidade);
}
