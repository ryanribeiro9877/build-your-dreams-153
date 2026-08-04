/* ============================================================
   Motores 2 e 3 — vocabulário (Cards 6, 7, 8, 9, 10)
   ============================================================
   Fonte única dos rótulos e dos CÓDIGOS aceitos pelo banco. Todo `value` aqui é
   o código EXATO validado por um CHECK em produção (lidos do banco em 29/07/2026)
   — renomear um value derruba a gravação com 23514, não é ajuste cosmético.

   Os mesmos códigos estão nos enums das tools do chat
   (supabase/functions/chat-orchestrator/tools/registry.ts); se um lado mudar, o
   outro muda junto. Ver também src/lib/motor1.ts (Cards 3/4/5).
============================================================ */

/* ─── Card 6: reclamações administrativas ─────────────────────────────────── */

/** CHECK reclamacoes_administrativas_orgao_check */
export const RECLAMACAO_ORGAO_LABELS: Record<string, string> = {
  procon: "Procon",
  bacen: "Banco Central",
  inss: "INSS",
  consumidor_gov: "consumidor.gov",
  ouvidoria_banco: "Ouvidoria do banco",
  email_banco: "E-mail ao banco",
  outro: "Outro",
};
export const RECLAMACAO_ORGAO_OPTIONS = Object.entries(RECLAMACAO_ORGAO_LABELS)
  .map(([value, label]) => ({ value, label }));

/** CHECK reclamacoes_administrativas_desfecho_check.
 *  Cores conforme o card: pendente=amarelo (p), atendida=verde (ok),
 *  negada/sem_resposta=vermelho (d). */
export const RECLAMACAO_DESFECHO_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "p" },
  atendida: { label: "Atendida", cls: "ok" },
  negada: { label: "Negada", cls: "d" },
  sem_resposta: { label: "Sem resposta", cls: "d" },
};
/** Escolhíveis ao registrar a RESPOSTA — `pendente` fica fora de propósito:
 *  é o estado inicial, não um desfecho que alguém informa. */
export const RECLAMACAO_DESFECHO_OPTIONS = ["atendida", "negada", "sem_resposta"]
  .map(value => ({ value, label: RECLAMACAO_DESFECHO_META[value].label }));

/* ─── Card 8: pipeline de execução ────────────────────────────────────────── */

/** CHECK execucoes_fase_check — as 15 fases, na ORDEM EXATA do array do CHECK
 *  (lido do banco em 04/08/2026). Esta é a lista COMPLETA: serve ao filtro de fase
 *  e ao seletor "mover para a fase". Antes daqui só existiam 11 — as quatro que
 *  faltavam (pago_parcial, arquivada, suspensa, extinta) já tinham dado em produção
 *  (import de 30/07: 8 arquivada, 2 suspensa, 1 pago_parcial, 1 extinta em 300) e
 *  eram invisíveis/inalcançáveis pela tela.
 *  ATENÇÃO: esta ordem NÃO é a trilha desenhada na tela — ver EXECUCAO_TRILHA. */
export const EXECUCAO_FASES = [
  "ajuizada", "prazo_pagamento", "pedido_penhora", "sisbajud", "penhora_negativa",
  "redirecionamento", "pago", "pago_parcial", "deposito_judicial", "expedicao_alvara",
  "alvara_pendente_assinatura", "arquivada", "suspensa", "extinta", "encerrada",
] as const;

/** A ESPINHA do pipeline — o que a trilha horizontal desenha, um traço por etapa.
 *  São só as 11 etapas PROCESSUAIS, em sequência. `redirecionamento` e
 *  `penhora_negativa` são desvios, não etapas finais, mas ficam na sequência por
 *  serem o caminho comum após Sisbajud.
 *  POR QUE as 4 novas não entram como traço 12/13/14/15:
 *   - arquivada/suspensa/extinta são ESTADOS que podem cair sobre a execução a
 *     partir de QUALQUER etapa (o import tem execução arquivada que nunca passou
 *     por penhora). Pintá-las como etapa 12+ faria a trilha afirmar que penhora,
 *     depósito e alvará aconteceram — mentira desenhada. Ficam fora da trilha
 *     (posição null) e só aparecem no chip.
 *   - pago_parcial não é etapa nova: é a MESMA etapa do pagamento, cumprida em
 *     parte (a própria RPC diz que a execução segue viva para o saldo). Divide o
 *     traço de `pago` — ver EXECUCAO_FASE_TRILHA_POS. */
export const EXECUCAO_TRILHA = [
  "ajuizada", "prazo_pagamento", "pedido_penhora", "sisbajud", "penhora_negativa",
  "redirecionamento", "pago", "deposito_judicial", "expedicao_alvara",
  "alvara_pendente_assinatura", "encerrada",
] as const;

/** Onde cada uma das 15 fases cai na trilha. `null` = fora da trilha. */
export const EXECUCAO_FASE_TRILHA_POS: Record<string, number | null> = {
  ...Object.fromEntries(EXECUCAO_TRILHA.map((f, i) => [f, i])),
  pago_parcial: EXECUCAO_TRILHA.indexOf("pago"),
  arquivada: null,
  suspensa: null,
  extinta: null,
};

/** Posição na trilha; `null` tanto para fase fora da trilha quanto para código
 *  desconhecido (fase nova no banco antes de chegar aqui) — nos dois casos a tela
 *  não tem como afirmar até onde o processo andou. */
export function posNaTrilha(fase: string): number | null {
  return EXECUCAO_FASE_TRILHA_POS[fase] ?? null;
}

export const EXECUCAO_FASE_LABELS: Record<string, string> = {
  ajuizada: "Ajuizada",
  prazo_pagamento: "Prazo de pagamento",
  pedido_penhora: "Pedido de penhora",
  sisbajud: "Sisbajud",
  penhora_negativa: "Penhora negativa",
  redirecionamento: "Redirecionamento",
  pago: "Pago",
  pago_parcial: "Pago em parte",
  deposito_judicial: "Depósito judicial",
  expedicao_alvara: "Expedição de alvará",
  alvara_pendente_assinatura: "Alvará p/ assinatura",
  arquivada: "Arquivada",
  suspensa: "Suspensa",
  extinta: "Extinta",
  encerrada: "Encerrada",
};

export const EXECUCAO_FASE_OPTIONS = EXECUCAO_FASES
  .map(value => ({ value, label: EXECUCAO_FASE_LABELS[value] }));

/** Fase INICIAL de uma execução nova. É um subconjunto de propósito: a RPC
 *  `iniciar_execucao` valida contra 11 fases e, para qualquer coisa fora dessa
 *  lista, CAI CALADA em 'ajuizada' (não devolve erro). Oferecer "Arquivada" aqui
 *  gravaria "Ajuizada" sem avisar ninguém. Quem precisa dessas quatro usa
 *  "mover para a fase" depois — `atualizar_fase_execucao` aceita as 15. */
export const EXECUCAO_FASE_INICIAL_OPTIONS = EXECUCAO_TRILHA
  .map(value => ({ value: value as string, label: EXECUCAO_FASE_LABELS[value] }));

/** Cor do chip por natureza da fase: dinheiro entrando = verde, desvio/desfecho
 *  ruim = vermelho, espera = amarelo, andamento = neutro.
 *  pago_parcial é AMARELO (não verde): entrou parte, ainda falta o saldo.
 *  extinta é VERMELHO: execução morreu sem receber. arquivada/suspensa são
 *  neutro/amarelo — processo parado, não processo resolvido. */
export const EXECUCAO_FASE_CLS: Record<string, string> = {
  ajuizada: "n",
  prazo_pagamento: "p",
  pedido_penhora: "n",
  sisbajud: "n",
  penhora_negativa: "d",
  redirecionamento: "d",
  pago: "ok",
  pago_parcial: "p",
  deposito_judicial: "ok",
  expedicao_alvara: "ok",
  alvara_pendente_assinatura: "p",
  arquivada: "n",
  suspensa: "p",
  extinta: "d",
  encerrada: "n",
};

/** Só `encerrada` tira a execução do tickler: o cron
 *  `gerar_pendencias_revisao_execucao` filtra `fase <> 'encerrada'` e nada mais
 *  (lido do banco em 04/08/2026). Logo arquivada, suspensa, extinta e pago_parcial
 *  CONTINUAM gerando pendência de revisão — desde que `proxima_revisao` esteja
 *  marcada. Sem isso a tela parece bugada quando a revisão volta num processo
 *  "arquivado". */
export const EXECUCAO_FASE_TERMINAL = "encerrada";
export function faseMantemTickler(fase: string): boolean {
  return fase !== EXECUCAO_FASE_TERMINAL;
}

/** Fases que PARECEM fim de linha mas não são — a tela precisa dizer isso em voz
 *  alta. Texto de UI (estático, mostrado antes e depois de mover); a nota oficial
 *  de cada mudança vem no campo `nota` de `atualizar_fase_execucao` e é exibida
 *  literalmente. A RPC dá nota para pago_parcial, arquivada e suspensa — NÃO dá
 *  para extinta, embora o tickler também siga vigiando extinta; por isso o texto
 *  de `extinta` aqui é nosso, não da RPC. */
const NAO_ENCERRA: Record<string, string> = {
  pago_parcial: "Pagou só parte: a execução segue viva para cobrar o saldo.",
  arquivada: "Arquivada NÃO encerra a execução.",
  suspensa: "Suspensa NÃO encerra a execução.",
  extinta: "Extinta NÃO tira do tickler: só a fase “Encerrada” faz isso.",
};

/**
 * O aviso é CONDICIONAL, e isso não é detalhe: o cron
 * `gerar_pendencias_revisao_execucao` exige `proxima_revisao IS NOT NULL AND
 * <= current_date`. Medido em 04/08: das 300 execuções, **1** tem revisão marcada —
 * e das 12 nas quatro fases novas, **nenhuma**. A primeira versão deste texto
 * afirmava "o lembrete de revisão continua vindo" sem condição, o que era falso
 * para 100% das linhas dessas fases. Prometer vigilância que não existe é pior que
 * não avisar: o usuário arquiva achando que alguém volta a olhar.
 *
 * `temRevisaoMarcada` = execucoes.proxima_revisao não nula.
 */
export function avisoFaseNaoTerminal(fase: string, temRevisaoMarcada: boolean): string | undefined {
  const base = NAO_ENCERRA[fase];
  if (!base) return undefined;
  return temRevisaoMarcada
    ? `${base} O lembrete de revisão continua vindo, porque há próxima revisão marcada.`
    : `${base} Mas NÃO há próxima revisão marcada: ninguém vai ser lembrado disso. Use "Remarcar revisão" se quiser que volte.`;
}

/** A fase merece o selo "não encerra"? Só isso — sem afirmar nada sobre o tickler,
 *  que depende de `proxima_revisao` e por isso vive em avisoFaseNaoTerminal(). */
export function faseNaoEncerra(fase: string): boolean {
  return NAO_ENCERRA[fase] !== undefined;
}

/** Contador de cabeçalho que ACOMPANHA o filtro. O defeito que isto corrige é de
 *  confiança: a tela mostrava "· 300" com 128 linhas na frente do usuário, e aí o
 *  número deixa de ser informação e passa a parecer erro. Com filtro ativo diz
 *  "128 de 300" — o visível primeiro, o total ainda visível para não perder a
 *  noção do tamanho da base. */
export function contadorComFiltro(visiveis: number, total: number): string {
  return visiveis === total ? String(total) : `${visiveis} de ${total}`;
}

/** CHECK execucoes_reu_tipo_check */
export const REU_TIPO_LABELS: Record<string, string> = {
  sindicato: "Sindicato",
  banco: "Banco",
  empresa: "Empresa",
  pessoa_fisica: "Pessoa física",
  outro: "Outro",
};
export const REU_TIPO_OPTIONS = Object.entries(REU_TIPO_LABELS)
  .map(([value, label]) => ({ value, label }));

/* ─── Card 7: fila de credenciais gov.br ──────────────────────────────────── */

/** Estados aceitos por `fila_credenciais_gov` (validados dentro da RPC; valor
 *  fora da lista devolve ok:false/estado_invalido, não erro). */
export const FILA_GOV_ESTADOS: { value: string; label: string; hint: string }[] = [
  { value: "bronze", label: "Bronze", hint: "nível da conta — precisa converter presencialmente" },
  { value: "prata", label: "Prata", hint: "nível da conta" },
  { value: "ouro", label: "Ouro", hint: "nível da conta" },
  { value: "2fa", label: "Com 2FA", hint: "exige verificação em dois fatores" },
  { value: "invalido", label: "Senha inválida", hint: "acesso não funciona" },
  { value: "bloqueado", label: "Conta bloqueada", hint: "acesso bloqueado" },
  { value: "sem_senha", label: "Sem senha guardada", hint: "existe credencial, mas sem senha no cofre" },
  { value: "sem_credencial", label: "Sem credencial", hint: "nada guardado para este cliente" },
];

/** Situação do acesso (coluna client_gov_credentials.status_acesso).
 *  A tool `atualizar_status_credencial_gov` aceita: valido, invalido, bloqueado,
 *  pendente. ATENÇÃO: o cadastro/cofre usa também `senha_incorreta` em outro
 *  fluxo — aqui ficam só os quatro que esta RPC aceita. */
export const STATUS_ACESSO_META: Record<string, { label: string; cls: string }> = {
  valido: { label: "Válido", cls: "ok" },
  invalido: { label: "Inválido", cls: "d" },
  bloqueado: { label: "Bloqueado", cls: "d" },
  pendente: { label: "Pendente", cls: "p" },
  senha_incorreta: { label: "Senha incorreta", cls: "d" },
};
export const STATUS_ACESSO_OPTIONS = ["valido", "invalido", "bloqueado", "pendente"]
  .map(value => ({ value, label: STATUS_ACESSO_META[value].label }));
