/* ============================================================
   P2 (edge) — vocabulário, tradução de motivo e notas dos Cards 11/13/14/15
   ============================================================
   Espelho de src/lib/p2.ts para o runtime Deno: a edge não importa de src/.
   Todo código de valor saiu de pg_get_constraintdef e todo `motivo` de
   pg_get_functiondef, lidos do banco em 30/07/2026.

   POR QUE este arquivo existe (e não vive dentro de handlers.ts): handlers.ts
   importa o supabase-js do esm.sh, então não é testável sem rede. A lógica que
   REALMENTE pode errar — traduzir motivo, decidir o que é aviso e o que não é,
   contar semáforo — fica aqui e roda em `deno test` sem banco (mesmo motivo de
   campanhaFiltro.ts).

   As RPCs destes cards devolvem `mensagem` em apenas 6 dos motivos; nos outros o
   texto em português é DAQUI. Motivo sem tradução vira "não consegui concluir",
   que foi exatamente o tipo de resposta que gerou o incidente de 28/07.
============================================================ */

/* ─── Card 11: diligências ────────────────────────────────────────────────── */

/** CHECK diligencias_tipo_check (a RPC também aceita sinônimos em pt-BR). */
export const DILIGENCIA_TIPOS = [
  "balcao_virtual", "concluso_analise", "expedicao_alvara", "peticao", "carta_precatoria", "outro",
] as const;

/** Recortes aceitos por consultar_diligencias (`todas` não é status de coluna). */
export const DILIGENCIA_STATUS_CONSULTA = ["pendente", "cumprida", "prejudicada", "todas"] as const;

/* ─── Card 13: lembretes de audiência ─────────────────────────────────────── */

/** CHECK audiencia_lembretes_status_check menos `pendente` (estado inicial, não decisão). */
export const LEMBRETE_STATUS_ACAO = ["feito", "nao_atendeu", "cancelado"] as const;

/* ─── Card 14: apólices SUSEP ─────────────────────────────────────────────── */

/** CHECK apolices_seguro_premio_periodicidade_check. */
export const PREMIO_PERIODICIDADES = ["mensal", "unico", "anual", "outro"] as const;
/** CHECK apolices_seguro_origem_desconto_check. */
export const ORIGENS_DESCONTO = ["extrato_inss", "conta_bancaria", "contracheque", "outro"] as const;

/* ─── Card 15: procurações ────────────────────────────────────────────────── */

/** CHECK procuracoes_tipo_check. */
export const PROCURACAO_TIPOS = ["ad_judicia", "ad_judicia_et_extra", "especifica", "outro"] as const;

/* ─── Utilitários de entrada ──────────────────────────────────────────────── */

/** Acento fora, minúsculo — para casar "cumpridas"/"não atendeu" sem depender do LLM. */
// Faixa de marcas combinantes montada por código (o range aparece literal em
// handlers.ts e fica ilegível no diff).
const MARCAS_COMBINANTES = new RegExp("[\\u0300-\\u036f]", "g");
function fold(s: string): string {
  return s.normalize("NFD").replace(MARCAS_COMBINANTES, "").toLowerCase().trim();
}

/**
 * Data para coluna `date`: string vazia em coluna date é 22007, então vira NULL.
 * Aceita só AAAA-MM-DD (é o que o schema das tools pede); qualquer outra coisa
 * volta como `invalida` para o handler perguntar em vez de gravar lixo.
 */
export function dataOuNull(v: unknown): { valor: string | null; invalida?: string } {
  const s = String(v ?? "").trim();
  if (!s) return { valor: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { valor: null, invalida: s };
  return { valor: s };
}

/** Inteiro dentro de faixa; fora da faixa/NaN devolve `invalido` (nunca coage em silêncio). */
export function intOuNull(v: unknown, min: number, max: number): { valor: number | null; invalido?: string } {
  if (v === undefined || v === null || v === "") return { valor: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { valor: null, invalido: String(v) };
  const t = Math.trunc(n);
  if (t < min || t > max) return { valor: null, invalido: String(v) };
  return { valor: t };
}

const STATUS_DILIGENCIA_SINONIMOS: Record<string, string> = {
  pendente: "pendente", pendentes: "pendente", aberta: "pendente", abertas: "pendente",
  "em aberto": "pendente", vencida: "pendente", vencidas: "pendente",
  cumprida: "cumprida", cumpridas: "cumprida", feita: "cumprida", feitas: "cumprida",
  concluida: "cumprida", concluidas: "cumprida",
  prejudicada: "prejudicada", prejudicadas: "prejudicada",
  todas: "todas", todos: "todas", tudo: "todas", "todas as diligencias": "todas",
};

/**
 * A RPC consultar_diligencias COAGE status desconhecido para 'pendente' em
 * silêncio — quem pedisse "as cumpridas" receberia as pendentes e acreditaria.
 * Aqui valor não reconhecido volta como ERRO (pergunta), nunca como resposta.
 * `valor: null` = omitir o argumento e ficar com o default 'pendente' da RPC.
 */
export function normalizarStatusDiligencia(raw: unknown): { valor: string | null; erro?: string } {
  const s = fold(String(raw ?? ""));
  if (!s) return { valor: null };
  const v = STATUS_DILIGENCIA_SINONIMOS[s];
  if (!v) {
    return { valor: null, erro: `não entendi o recorte "${String(raw).trim()}". Use pendente, cumprida, prejudicada ou todas.` };
  }
  return { valor: v };
}

const STATUS_LEMBRETE_SINONIMOS: Record<string, string> = {
  feito: "feito", feita: "feito", avisado: "feito", avisada: "feito", ok: "feito",
  falei: "feito", atendeu: "feito", confirmado: "feito", confirmou: "feito",
  nao_atendeu: "nao_atendeu", "nao atendeu": "nao_atendeu", "nao respondeu": "nao_atendeu",
  "caixa postal": "nao_atendeu", "nao conseguiu falar": "nao_atendeu",
  cancelado: "cancelado", cancelada: "cancelado", cancelou: "cancelado",
};

/**
 * Status do lembrete de audiência. Devolver ERRO em valor desconhecido é
 * deliberado: o default da RPC é 'feito', e assumir "feito" sem o usuário ter
 * dito isso registra um aviso ao cliente que nunca aconteceu.
 */
export function normalizarStatusLembrete(raw: unknown): { valor: string | null; erro?: string } {
  const s = fold(String(raw ?? ""));
  if (!s) return { valor: null };
  const v = STATUS_LEMBRETE_SINONIMOS[s];
  if (!v) {
    return { valor: null, erro: `não entendi o resultado "${String(raw).trim()}". Use feito, nao_atendeu ou cancelado.` };
  }
  return { valor: v };
}

/* ─── Tradução dos motivos de ok:false ────────────────────────────────────── */

/**
 * Traduz os motivos EXCLUSIVOS dos Cards 11/13/14/15 (lidos do corpo das RPCs).
 * Devolve null quando o motivo não é destes cards — aí quem chamou usa o
 * tradutor genérico (cliente ambíguo / não encontrado / processo).
 * `oQueNaoFoiFeito` é obrigatório na frase: toda falha diz o que NÃO aconteceu.
 */
export function mensagemMotivoP2(r: Record<string, unknown>, oQueNaoFoiFeito: string): string | null {
  const motivo = String(r.motivo ?? "");
  const base = String(r.mensagem ?? "").trim();
  switch (motivo) {
    // ── Card 11 ──
    case "descricao_obrigatoria":
      return `me diga O QUE precisa ser feito na diligência (ex.: "balcão virtual pedindo agilidade na análise") — ${oQueNaoFoiFeito}`;
    case "tipo_invalido":
      return `${base || "Tipos: balcao_virtual, concluso_analise, expedicao_alvara, peticao, carta_precatoria, outro."} — ${oQueNaoFoiFeito}`;
    case "processo_nao_informado":
      return `${base || "Informe o número do processo (a diligência sempre pertence a um processo)."} — ${oQueNaoFoiFeito}`;
    case "diligencia_nao_encontrada":
      return `não encontrei essa diligência. Liste as diligências primeiro e use o id de lá — ${oQueNaoFoiFeito}`;
    case "diligencia_ja_encerrada":
      return `essa diligência já está ${String(r.status_atual ?? "").trim() || "encerrada"} — só é possível cumprir diligência pendente. ${oQueNaoFoiFeito}`;
    // ── Card 14 ──
    case "seguradora_obrigatoria":
      return `preciso do nome da seguradora — ${oQueNaoFoiFeito}`;
    case "apolice_nao_encontrada":
      return `não encontrei essa apólice. Liste as apólices do cliente primeiro e use o id de lá — ${oQueNaoFoiFeito}`;
    // ── Card 13 ──
    case "lembrete_nao_encontrado":
      return `não encontrei esse lembrete de audiência (o id vem do preparo da audiência ou do card da pendência) — ${oQueNaoFoiFeito}`;
    case "audiencia_nao_encontrada":
      return `não encontrei essa audiência. Liste as audiências primeiro e use o id de lá — ${oQueNaoFoiFeito}`;
    // ── Card 15 ──
    case "data_assinatura_obrigatoria":
      // Exigência do card: dizer QUAL data é. Data do upload gera vigência errada
      // e a procuração "vence" no dia errado — erro invisível até faltar poder.
      return `${base || "A data de ASSINATURA é o que define a vigência."} Use a data em que a procuração foi ASSINADA, não a data do upload — ${oQueNaoFoiFeito}`;
    case "data_futura":
      return `${base || "Data de assinatura no futuro."} Confira a data — ${oQueNaoFoiFeito}`;
    case "nada_a_renovar":
      return `${base || "Nenhuma procuração vencendo na janela informada."} Nenhuma campanha foi criada.`;
    default:
      return null;
  }
}

/* ─── Notas derivadas (o que a RPC NÃO diz e o usuário precisa saber) ─────── */

function hojeISO(hoje: Date): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}

/**
 * registrar_diligencia NÃO valida prazo no passado: grava e cria a pendência com
 * data fatal já vencida, sem aviso nenhum. O alerta é nosso.
 */
export function avisoPrazoPassado(prazo: unknown, hoje: Date = new Date()): string | null {
  const d = dataOuNull(prazo);
  if (!d.valor) return null;
  return d.valor < hojeISO(hoje)
    ? `O prazo informado (${d.valor}) já passou — a pendência nasce VENCIDA. Confirme se a data está certa.`
    : null;
}

interface DiligenciaItem {
  vencida?: boolean;
  processo_vinculado?: boolean;
  prazo?: string | null;
}

/** Semáforo da lista de diligências: o que exige ação hoje. */
export function resumoDiligencias(r: Record<string, unknown>): {
  vencidas: number; sem_prazo: number; sem_processo_vinculado: number; notas: string[];
} {
  const lista = (Array.isArray(r.diligencias) ? r.diligencias : []) as DiligenciaItem[];
  const vencidas = lista.filter((d) => d?.vencida === true).length;
  const semPrazo = lista.filter((d) => !d?.prazo).length;
  const semVinculo = lista.filter((d) => d?.processo_vinculado === false).length;
  const notas: string[] = [];
  if (vencidas > 0) notas.push(`${vencidas} diligência(s) com prazo JÁ VENCIDO.`);
  if (semPrazo > 0) notas.push(`${semPrazo} sem prazo cadastrado — essas não têm pendência cobrando no Kanban.`);
  if (semVinculo > 0) notas.push(`${semVinculo} guardada(s) só pelo NÚMERO do processo (processo ainda não cadastrado) — vincular quando o processo for criado.`);
  return { vencidas, sem_prazo: semPrazo, sem_processo_vinculado: semVinculo, notas };
}

/** Notas do registro de diligência (aviso-ponte da RPC + o que ela não avisa). */
export function notasDiligenciaRegistrada(r: Record<string, unknown>, prazo: unknown, hoje?: Date): string[] {
  const notas: string[] = [];
  // Caminho PONTE: processo não cadastrado, diligência guardada pelo número.
  if (r.aviso) notas.push(String(r.aviso));
  else if (r.processo_vinculado === false) {
    notas.push("Processo ainda não cadastrado no sistema — diligência guardada pelo número. Vincular quando o processo for criado.");
  }
  if (r.pendencia_prazo_criada === false) {
    notas.push("Sem prazo informado, então NÃO nasceu pendência no Kanban — nada vai cobrar esta diligência.");
  }
  const av = avisoPrazoPassado(prazo, hoje);
  if (av) notas.push(av);
  return notas;
}

/**
 * Notas do cumprimento. `sem_protocolo` vem true para os 6 tipos, mas por decisão
 * de 30/07 o protocolo NÃO é obrigatório: só é ALERTA quando a própria RPC manda
 * `aviso` (balcão virtual). Sem aviso, a menção é neutra — nunca cobrança.
 */
export function notasDiligenciaCumprida(r: Record<string, unknown>): string[] {
  const notas: string[] = [];
  if (r.aviso) notas.push(String(r.aviso));
  else if (r.sem_protocolo === true) {
    notas.push("Registrada sem número de protocolo — o protocolo não é obrigatório neste tipo, então nada ficou pendente por isso.");
  }
  if (r.pendencia_fechada === false) notas.push("Não havia pendência de prazo vinculada para encerrar.");
  if (r.rediligencia_id) notas.push(`Rediligência agendada para ${String(r.rediligenciar_em ?? "a data informada")} — nasce como diligência NOVA ligada a esta, com pendência própria.`);
  return notas;
}

interface ApoliceItem { reconhecida?: boolean | null; periodicidade?: string | null }

/**
 * Notas da consulta de apólices. Dois pontos cegos da RPC:
 * 1. `premio_mensal_somado` soma SÓ periodicidade 'mensal' e vem NULL (não 0)
 *    quando nada é mensal — sem esta nota o total soa como "não há prêmio".
 * 2. sem nenhum filtro a consulta é dump global SEM LIMIT.
 */
export function notasApolices(r: Record<string, unknown>, comFiltro: boolean): string[] {
  const notas: string[] = [];
  const total = Number(r.total ?? 0);
  const lista = (Array.isArray(r.apolices) ? r.apolices : []) as ApoliceItem[];
  if (total > 0 && (r.premio_mensal_somado === null || r.premio_mensal_somado === undefined)) {
    notas.push("Nenhuma apólice com prêmio MENSAL: a soma de prêmio mensal não se aplica (ela considera só periodicidade mensal) — não é o mesmo que prêmio zero.");
  }
  const naoReconhecidas = lista.filter((a) => a?.reconhecida === false).length;
  const semResposta = lista.filter((a) => a?.reconhecida === null || a?.reconhecida === undefined).length;
  if (naoReconhecidas > 0) notas.push(`${naoReconhecidas} apólice(s) que o cliente NÃO reconhece — insumo da tese de seguro não autorizado (SUSEP).`);
  if (semResposta > 0) notas.push(`${semResposta} sem confirmação do cliente (não foi perguntado) — confirmar na próxima ligação.`);
  if (!comFiltro && total > 0) notas.push(`Consulta sem nenhum filtro: veio a base INTEIRA de apólices (${total} registro(s)), sem limite.`);
  return notas;
}

/** Notas do registro de apólice (`nota` da RPC tem TRÊS estados de reconhecida). */
export function notasApoliceRegistrada(r: Record<string, unknown>): string[] {
  const notas: string[] = [];
  if (r.nota) notas.push(String(r.nota));
  return notas;
}

interface ProcuracaoItem { vencida?: boolean; dias_para_vencer?: number | null; tem_pdf?: boolean }

/** Notas da consulta de procurações: vencida = cliente descoberto. */
export function notasProcuracoes(r: Record<string, unknown>, comFiltro: boolean): string[] {
  const notas: string[] = [];
  const total = Number(r.total ?? 0);
  const vencidas = Number(r.ja_vencidas ?? 0);
  const lista = (Array.isArray(r.procuracoes) ? r.procuracoes : []) as ProcuracaoItem[];
  if (vencidas > 0) notas.push(`${vencidas} procuração(ões) JÁ VENCIDA(S) — nesses casos o escritório está sem poderes até renovar.`);
  const vencendo30 = lista.filter((p) => p?.vencida !== true && typeof p?.dias_para_vencer === "number"
    && (p.dias_para_vencer as number) >= 0 && (p.dias_para_vencer as number) <= 30).length;
  if (vencendo30 > 0) notas.push(`${vencendo30} vence(m) em até 30 dias.`);
  const semPdf = lista.filter((p) => p?.tem_pdf === false).length;
  if (semPdf > 0) notas.push(`${semPdf} sem PDF anexado ao dossiê — só o registro da vigência.`);
  if (!comFiltro && total > 0) notas.push(`Consulta sem nenhum filtro: veio a base INTEIRA de procurações (${total} registro(s)), sem limite.`);
  return notas;
}

/** Notas do registro de procuração: renovação, status da anterior e vencimento. */
export function notasProcuracaoRegistrada(r: Record<string, unknown>): string[] {
  const notas: string[] = [];
  if (r.renovou_anterior === true) {
    const st = String(r.status_da_anterior ?? "").trim();
    notas.push(st === "vencida"
      // A anterior vencida é o caso comum e o que dói: houve intervalo sem poderes.
      ? "Substituiu a procuração anterior, que estava VENCIDA — o cliente ficou descoberto entre o vencimento e esta assinatura."
      : `Substituiu a procuração anterior (situação dela: ${st || "vigente"}), agora marcada como renovada.`);
    if (r.pendencia_renovacao_fechada === true) notas.push("A pendência de renovação aberta deste cliente foi encerrada.");
    else notas.push("Não havia pendência de renovação aberta para encerrar.");
  } else {
    notas.push("Primeira procuração registrada para este cliente (não havia anterior a substituir).");
  }
  if (r.aviso) notas.push(String(r.aviso));
  return notas;
}

/**
 * Notas do preparo de audiência. `limitacao` é texto FIXO da RPC: repassar sempre,
 * mas NUNCA usar como sinal de problema.
 */
export function notasPreparoAudiencia(r: Record<string, unknown>): string[] {
  const notas: string[] = [];
  if (r.tese_resolvida === false) {
    notas.push(
      "Não consegui casar o tipo de ação desta audiência com nenhuma tese cadastrada: " +
      "a lista de documentos veio SÓ com a procuração e o parecer está INCOMPLETO. " +
      "Para valer a matriz da tese, cadastre um apelido desse tipo de ação em tipo_acao_apelidos.",
    );
  }
  if (r.cliente_vinculado === false) {
    notas.push(
      "A audiência não está vinculada a um cliente CADASTRADO: não foi possível conferir o dossiê, " +
      "então todo documento aparece como faltando por falta de vínculo — não por ausência real.",
    );
  } else {
    const falta = (Array.isArray(r.documentos_faltando) ? r.documentos_faltando : []) as string[];
    if (falta.length > 0) notas.push(`Faltam ${falta.length} documento(s): ${falta.join(", ")}.`);
    else notas.push("Todos os documentos esperados já estão no dossiê.");
  }
  const lembretes = (Array.isArray(r.lembretes) ? r.lembretes : []) as Array<{ status?: string }>;
  if (lembretes.length === 0) notas.push("Nenhum lembrete de aviso ao cliente cadastrado para esta audiência.");
  if (r.limitacao) notas.push(String(r.limitacao));
  return notas;
}

/** Notas do lembrete: `nao_atendeu` MANTÉM a pendência aberta (nova tentativa). */
export function notasLembreteAudiencia(r: Record<string, unknown>): string[] {
  const notas: string[] = [];
  if (String(r.status ?? "") === "nao_atendeu") {
    notas.push(String(r.nota ?? "Pendência permanece aberta para nova tentativa.")
      + " Ou seja: o lembrete continua na fila — é preciso tentar ligar de novo.");
  } else if (r.nota) notas.push(String(r.nota));
  // `pendencia_encerrada` é DERIVADO — (status IN ('feito','cancelado') AND
  // pendencia_task_id IS NOT NULL) — e o UPDATE tem WHERE completed_at IS NULL AND
  // cancelled_at IS NULL. Vem true mesmo quando ZERO linhas foram atualizadas (a
  // tarefa já estava concluída ou cancelada). Afirmar "foi encerrada" é afirmar o
  // que o banco não garante; a tela (audienciaCard13.ts) já dizia isso e o chat
  // discordava dela. Redigido para relatar o indicador, não o fato.
  if (r.pendencia_encerrada === true) {
    notas.push("O indicador do banco diz que a pendência deste lembrete deve estar encerrada — "
      + "é um indicador DERIVADO do status, não a confirmação de que a tarefa foi fechada. "
      + "Se ela ainda aparecer aberta no Kanban, feche por lá.");
  } else if (String(r.status ?? "") !== "nao_atendeu") {
    notas.push("Não havia pendência vinculada a este lembrete para encerrar.");
  }
  return notas;
}

/**
 * Notas da campanha de renovação. `clientes_na_fila = 0` COM ok:true é campanha
 * criada VAZIA (todos já estavam em campanha aberta do mesmo objetivo) — sem esta
 * nota o usuário acha que tem fila para ligar.
 */
export function notasCampanhaRenovacao(r: Record<string, unknown>): string[] {
  const notas: string[] = [];
  const fila = Number(r.clientes_na_fila ?? 0);
  const semTel = Number(r.sem_telefone ?? 0);
  if (fila === 0) {
    notas.push("A campanha foi criada VAZIA: nenhum cliente novo entrou na fila (os que têm procuração vencendo já estão em campanha aberta de renovação). Não há ninguém para ligar nesta campanha.");
  } else if (semTel > 0) {
    notas.push(String(r.aviso ?? `${semTel} de ${fila} clientes da fila estão SEM TELEFONE cadastrado — a fila é parcialmente inacionável.`));
  }
  if (fila > 0 && semTel === 0) notas.push(`${fila} cliente(s) na fila, todos com telefone cadastrado.`);
  return notas;
}
