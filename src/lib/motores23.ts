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

/** CHECK execucoes_fase_check — NA ORDEM do pipeline (é assim que a tela desenha
 *  a trilha horizontal). `redirecionamento` e `penhora_negativa` são desvios, não
 *  etapas finais, mas ficam na sequência por serem o caminho comum após Sisbajud. */
export const EXECUCAO_FASES = [
  "ajuizada", "prazo_pagamento", "pedido_penhora", "sisbajud", "penhora_negativa",
  "redirecionamento", "pago", "deposito_judicial", "expedicao_alvara",
  "alvara_pendente_assinatura", "encerrada",
] as const;

export const EXECUCAO_FASE_LABELS: Record<string, string> = {
  ajuizada: "Ajuizada",
  prazo_pagamento: "Prazo de pagamento",
  pedido_penhora: "Pedido de penhora",
  sisbajud: "Sisbajud",
  penhora_negativa: "Penhora negativa",
  redirecionamento: "Redirecionamento",
  pago: "Pago",
  deposito_judicial: "Depósito judicial",
  expedicao_alvara: "Expedição de alvará",
  alvara_pendente_assinatura: "Alvará p/ assinatura",
  encerrada: "Encerrada",
};

export const EXECUCAO_FASE_OPTIONS = EXECUCAO_FASES
  .map(value => ({ value, label: EXECUCAO_FASE_LABELS[value] }));

/** Cor do chip por natureza da fase: dinheiro entrando = verde, desvio = vermelho,
 *  espera = amarelo, andamento = neutro. */
export const EXECUCAO_FASE_CLS: Record<string, string> = {
  ajuizada: "n",
  prazo_pagamento: "p",
  pedido_penhora: "n",
  sisbajud: "n",
  penhora_negativa: "d",
  redirecionamento: "d",
  pago: "ok",
  deposito_judicial: "ok",
  expedicao_alvara: "ok",
  alvara_pendente_assinatura: "p",
  encerrada: "n",
};

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
