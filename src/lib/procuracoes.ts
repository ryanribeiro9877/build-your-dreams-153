/* ============================================================
   Card 15 — procurações: contrato das RPCs + lógica pura
   ============================================================
   Só o BANCO define este arquivo. Toda chave e todo `motivo` abaixo saiu de
   `pg_get_functiondef` em 30/07/2026 — não há nome inferido aqui.

   Por que uma camada pura separada: o semáforo, a linhagem e a leitura do
   resultado do registro são as partes que podem estar ERRADAS em silêncio
   (data usada, procuração escolhida como atual, vencida contada como futura).
   Isolado, isso é testável sem montar DOM.

   ARMADILHAS MEDIDAS NO CONTRATO (não "arrumar" sem olhar o banco):

   · consultar_procuracoes devolve, no ITEM, a chave `vencida` — NÃO `ja_vencida`.
     `ja_vencidas` (plural, int) é do CABEÇALHO da consulta e `ja_vencida`
     (singular, boolean) é do retorno de registrar_procuracao. Três nomes
     parecidos, três significados.
   · a RPC NÃO devolve `substituida_por_id`. A linhagem exige uma segunda
     leitura da tabela (a policy de SELECT permite: can_view_clients() OR
     is_socio_or_advogado(), superconjunto do gate da própria RPC).
   · `vencida` é derivada da DATA (validade_ate < current_date), não do status.
     O status só vira 'vencida' quando o cron roda — usar status para pintar a
     tela mostraria como vigente uma procuração que já caiu.
   · gerar_campanha_renovacao_procuracao pode responder ok:true com
     clientes_na_fila = 0: a checagem de "nada_a_renovar" olha as procurações,
     mas a inserção da fila descarta cliente que já está em campanha aberta do
     mesmo objetivo. Resultado: campanha CRIADA e VAZIA. A tela tem de dizer.
============================================================ */

import { PROCURACAO_TIPO_LABELS, VALIDADE_MESES_MAX, VALIDADE_MESES_MIN } from "./p2";

/* ─── Retornos das RPCs (chaves verbatim) ─────────────────────────────────── */

/** Item de `consultar_procuracoes` → procuracoes[]. */
export interface ProcuracaoItem {
  id: string;
  cliente: string;
  tipo: string;
  data_assinatura: string;
  validade_ate: string;
  status: string;
  dias_para_vencer: number;
  /** Derivada da data + não substituída. NÃO confundir com `ja_vencidas` do cabeçalho. */
  vencida: boolean;
  tem_pdf: boolean;
}

/** Envelope de `consultar_procuracoes`. */
export interface ConsultaProcuracoesRes {
  ok?: boolean;
  motivo?: string;
  total?: number;
  /** Contagem (int) de vencidas na janela — as MAIS urgentes. */
  ja_vencidas?: number;
  procuracoes?: ProcuracaoItem[];
}

/** Retorno de `registrar_procuracao`. */
export interface RegistroProcuracaoRes {
  ok?: boolean;
  motivo?: string;
  mensagem?: string;
  procuracao_id?: string;
  cliente?: string;
  tipo?: string;
  data_assinatura?: string;
  validade_ate?: string;
  renovou_anterior?: boolean;
  /** Status que a anterior TINHA antes de virar 'renovada'. 'vencida' = houve descoberto. */
  status_da_anterior?: string | null;
  pendencia_renovacao_fechada?: boolean;
  /** Singular: a procuração recém-gravada já nasceu vencida. */
  ja_vencida?: boolean;
  aviso?: string | null;
}

/** Retorno de `gerar_campanha_renovacao_procuracao`. */
export interface CampanhaRenovacaoRes {
  ok?: boolean;
  motivo?: string;
  mensagem?: string;
  campanha_id?: string;
  nome?: string;
  clientes_na_fila?: number;
  sem_telefone?: number;
  janela_dias?: number;
  aviso?: string | null;
}

export type ErroRpc = { code?: string; message?: string } | null;

/** Nota exibida na tela. `cls` casa com as variantes de `.cli-chip`. */
export interface Nota {
  texto: string;
  cls: "ok" | "p" | "d" | "n";
}

/* ─── Falhas ──────────────────────────────────────────────────────────────── */

/** Único lugar que sabe o que 42501 significa: acesso, nunca "não há nada". */
function semAcesso(erro: ErroRpc): boolean {
  return erro?.code === "42501" || /sem permiss/i.test(erro?.message ?? "");
}

/**
 * Traduz a falha de `registrar_procuracao` sempre dizendo o que NÃO foi gravado.
 * Motivos VERBATIM do corpo da função (30/07/2026): data_assinatura_obrigatoria,
 * data_futura, cliente_nao_encontrado, ambiguo, cliente_nao_informado.
 * `protocolo_obrigatorio` e `desfecho_invalido` NÃO existem nesta RPC.
 */
export function falhaRegistro(res: RegistroProcuracaoRes | null, erro: ErroRpc): string | null {
  const prefixo = "Procuração NÃO registrada";
  if (erro) {
    if (semAcesso(erro)) return `${prefixo}: você não tem acesso para registrar procuração.`;
    return `${prefixo}: ${erro.message ?? "erro na chamada"}`;
  }
  if (!res) return `${prefixo}: a chamada não retornou resultado.`;
  if (res.ok) return null;
  const motivos: Record<string, string> = {
    // A mensagem da própria RPC é melhor que qualquer paráfrase: ela nomeia o
    // erro que o card existe para corrigir (usar a data do upload).
    data_assinatura_obrigatoria: res.mensagem
      ?? "informe a data de ASSINATURA da procuração (não a data do upload).",
    data_futura: res.mensagem ?? "data de assinatura no futuro. Conferir.",
    cliente_nao_encontrado: "cliente não encontrado.",
    cliente_nao_informado: "cliente não informado.",
    ambiguo: "mais de um cliente com esse nome.",
  };
  return `${prefixo}: ${motivos[res.motivo ?? ""] ?? res.mensagem ?? res.motivo ?? "erro não identificado."}`;
}

/**
 * Traduz a falha de `gerar_campanha_renovacao_procuracao`.
 * Único motivo de ok:false no corpo: `nada_a_renovar`.
 */
export function falhaCampanha(res: CampanhaRenovacaoRes | null, erro: ErroRpc): string | null {
  const prefixo = "Campanha NÃO criada";
  if (erro) {
    // O gate da campanha é MAIS estreito que o da consulta (recepção/sócio/admin;
    // advogado lista mas não gera) — daí a mensagem específica.
    if (semAcesso(erro)) return `${prefixo}: você não tem acesso (gerar campanha é da recepção, do sócio ou do admin).`;
    return `${prefixo}: ${erro.message ?? "erro na chamada"}`;
  }
  if (!res) return `${prefixo}: a chamada não retornou resultado.`;
  if (res.ok) return null;
  const motivos: Record<string, string> = {
    nada_a_renovar: res.mensagem ?? "nenhuma procuração vencendo na janela.",
  };
  return `${prefixo}: ${motivos[res.motivo ?? ""] ?? res.mensagem ?? res.motivo ?? "erro não identificado."}`;
}

/** Erro de LEITURA: 42501 vira acesso, nunca lista vazia silenciosa. */
export function falhaConsulta(res: ConsultaProcuracoesRes | null, erro: ErroRpc): string | null {
  if (erro) {
    if (semAcesso(erro)) return "Você não tem acesso às procurações deste cliente.";
    return `Erro ao carregar procurações: ${erro.message ?? "erro na chamada"}`;
  }
  if (!res) return "Erro ao carregar procurações: a chamada não retornou resultado.";
  if (res.ok) return null;
  const motivos: Record<string, string> = {
    ambiguo: "mais de um cliente com esse nome.",
    cliente_nao_encontrado: "cliente não encontrado.",
  };
  return `Não foi possível listar: ${motivos[res.motivo ?? ""] ?? res.motivo ?? "erro não identificado."}`;
}

/* ─── Notas do resultado do registro ─────────────────────────────────────── */

/**
 * TODO aviso/flag do retorno vira linha na tela — é o ponto do card. Nada aqui
 * é decorativo: `status_da_anterior = 'vencida'` significa que o cliente ficou
 * SEM procuração no intervalo, e isso não aparece em nenhum outro lugar.
 */
export function notasDoRegistro(res: RegistroProcuracaoRes): Nota[] {
  const notas: Nota[] = [];
  if (res.aviso) notas.push({ texto: res.aviso, cls: res.ja_vencida ? "d" : "p" });

  if (res.renovou_anterior) {
    if (res.status_da_anterior === "vencida") {
      notas.push({
        texto: "A procuração anterior estava VENCIDA: o cliente ficou descoberto no intervalo entre o vencimento e esta assinatura.",
        cls: "d",
      });
    } else {
      notas.push({
        texto: `A procuração anterior (${res.status_da_anterior ?? "sem status"}) foi marcada como renovada e substituída por esta.`,
        cls: "ok",
      });
    }
  } else {
    notas.push({ texto: "Primeira procuração deste cliente — não havia anterior para renovar.", cls: "n" });
  }

  notas.push(res.pendencia_renovacao_fechada
    ? { texto: "A pendência de renovação de procuração foi fechada.", cls: "ok" }
    : { texto: "Nenhuma pendência de renovação estava aberta para fechar.", cls: "n" });

  return notas;
}

/**
 * Notas do resultado da campanha. O caso perigoso é ok:true com fila 0 (campanha
 * criada e vazia) — a RPC não avisa disso, só devolve o número.
 */
export function notasDaCampanha(res: CampanhaRenovacaoRes): Nota[] {
  const notas: Nota[] = [];
  const fila = res.clientes_na_fila ?? 0;
  const semTel = res.sem_telefone ?? 0;

  if (fila === 0) {
    notas.push({
      texto: "Campanha criada VAZIA: 0 clientes entraram na fila. Todos os clientes com procuração vencendo já estão em campanha de renovação aberta — não há o que trabalhar nesta campanha.",
      cls: "d",
    });
  } else {
    notas.push({ texto: `${fila} cliente(s) na fila.`, cls: "ok" });
  }

  // `aviso` da RPC já traz o texto de sem-telefone quando semTel > 0; quando é 0
  // o silêncio dela seria lido como "não conferido", então dizemos explicitamente.
  if (res.aviso) {
    // O `aviso` da RPC JÁ é o texto de sem-telefone. Empilhar a nota própria depois
    // mostrava a mesma informação duas vezes no painel — daí o else-if.
    notas.push({ texto: res.aviso, cls: "d" });
  } else if (semTel > 0) {
    notas.push({
      texto: `${semTel} de ${fila} sem telefone: esses não podem ser contatados até o import de telefones — a fila é acionável só em parte.`,
      cls: "d",
    });
  } else if (fila > 0) {
    notas.push({ texto: "Todos os clientes da fila têm telefone cadastrado.", cls: "ok" });
  }
  return notas;
}

/* ─── Datas ───────────────────────────────────────────────────────────────── */

function diaUTC(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Diferença em dias entre duas datas ISO (b - a). Fuso ignorado de propósito:
 *  data pura em UTC não desloca o dia perto da meia-noite. */
export function diffDias(de: string, ate: string): number | null {
  const a = diaUTC(de);
  const b = diaUTC(ate);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

/** Hoje em ISO local (mesmo formato que o input type=date usa). */
export function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

/* ─── Escolha da atual e linhagem ─────────────────────────────────────────── */

/** Mapa id → substituida_por_id, lido direto da tabela (a RPC não devolve). */
export type MapaSubstituicao = Record<string, string | null>;

/** Só estes dois status podem ser a procuração corrente (o resto é histórico). */
const STATUS_CORRENTE = ["vigente", "vencida"];

/**
 * A procuração ATUAL do cliente: a última NÃO substituída — a mesma regra que
 * `registrar_procuracao` usa para decidir o que renovar (status corrente,
 * substituida_por_id IS NULL, maior validade_ate). Pode estar VENCIDA: é o caso
 * comum e o motivo do card.
 *
 * Sem o mapa de substituição (leitura da tabela negada/falhou) a regra degrada
 * para status + validade, que é equivalente na prática porque a RPC de registro
 * grava os dois campos na mesma transação.
 */
export function selecionarAtual(
  itens: ProcuracaoItem[],
  mapa: MapaSubstituicao = {},
): ProcuracaoItem | null {
  const candidatos = itens.filter(p =>
    STATUS_CORRENTE.includes(p.status) && !(mapa[p.id] ?? null));
  if (candidatos.length === 0) return null;
  return candidatos.reduce((melhor, p) =>
    (p.validade_ate > melhor.validade_ate ? p : melhor));
}

export interface LinhaHistorico {
  item: ProcuracaoItem;
  /** É a procuração corrente do cliente. */
  atual: boolean;
  /** A que substituiu esta, quando conhecida pelo mapa. */
  sucessor: ProcuracaoItem | null;
  /**
   * Dias em que o cliente ficou SEM procuração entre o fim desta e a assinatura
   * da sucessora. Só é preenchido quando > 0 — é buraco de representação, não
   * curiosidade.
   */
  diasDescoberto: number | null;
}

/**
 * Histórico do mais novo para o mais antigo, com a linhagem resolvida por
 * `substituida_por_id`. Ordenar por data de ASSINATURA (e não por criação)
 * porque é ela que define a vigência.
 */
export function montarLinhagem(
  itens: ProcuracaoItem[],
  mapa: MapaSubstituicao = {},
): LinhaHistorico[] {
  const porId = new Map(itens.map(p => [p.id, p]));
  const atual = selecionarAtual(itens, mapa);
  const ordenado = [...itens].sort((a, b) =>
    (b.data_assinatura.localeCompare(a.data_assinatura))
    || b.validade_ate.localeCompare(a.validade_ate));

  return ordenado.map(item => {
    const sucessorId = mapa[item.id] ?? null;
    const sucessor = sucessorId ? porId.get(sucessorId) ?? null : null;
    const lacuna = sucessor ? diffDias(item.validade_ate, sucessor.data_assinatura) : null;
    return {
      item,
      atual: atual?.id === item.id,
      sucessor,
      diasDescoberto: lacuna !== null && lacuna > 0 ? lacuna : null,
    };
  });
}

/* ─── Fila de renovação ───────────────────────────────────────────────────── */

/**
 * VENCIDAS PRIMEIRO. A janela de `p_vencendo_em_dias` inclui quem já venceu, e
 * quem já venceu é o mais urgente — ordenar por data crescente sem separar o
 * grupo esconderia isso no meio da lista.
 */
export function ordenarFilaRenovacao(itens: ProcuracaoItem[]): ProcuracaoItem[] {
  return [...itens].sort((a, b) =>
    (Number(b.vencida) - Number(a.vencida))
    || (a.dias_para_vencer - b.dias_para_vencer)
    || a.cliente.localeCompare(b.cliente, "pt-BR"));
}

/* ─── Formulário ──────────────────────────────────────────────────────────── */

/**
 * Validade em meses. Fora de 1–120 a RPC COAGE para 12 em silêncio (o valor
 * digitado desaparece sem erro), então barramos antes de enviar.
 */
export function parseValidadeMeses(txt: string): { valor: number | null; erro: string | null } {
  const t = txt.trim();
  if (t === "") return { valor: null, erro: null }; // null → a RPC aplica o default (12)
  if (!/^\d{1,3}$/.test(t)) return { valor: null, erro: "Validade em meses: só números inteiros." };
  const n = Number(t);
  if (n < VALIDADE_MESES_MIN || n > VALIDADE_MESES_MAX) {
    return {
      valor: null,
      erro: `Validade fora de ${VALIDADE_MESES_MIN}–${VALIDADE_MESES_MAX} meses: o banco trocaria por 12 sem avisar.`,
    };
  }
  return { valor: n, erro: null };
}

/** Rótulo do tipo, com fallback para o código cru (nunca inventa nome). */
export function tipoLabel(tipo: string): string {
  return PROCURACAO_TIPO_LABELS[tipo] ?? tipo;
}
