/* ============================================================
   P2 — vocabulário dos Cards 11, 13, 14 e 15
   ============================================================
   Fonte única dos rótulos e dos CÓDIGOS aceitos pelo banco. Todo `value` aqui saiu
   de `pg_get_constraintdef` em 30/07/2026 — valor fora da lista é 23514, não é
   ajuste cosmético. Ver src/lib/motor1.ts (Cards 3/4/5) e src/lib/motores23.ts
   (Cards 6/7/8/9/10).
============================================================ */

/* ─── Card 11: diligências ────────────────────────────────────────────────── */

/** CHECK diligencias_tipo_check */
export const DILIGENCIA_TIPO_LABELS: Record<string, string> = {
  balcao_virtual: "Balcão virtual",
  concluso_analise: "Concluso para análise",
  expedicao_alvara: "Expedição de alvará",
  peticao: "Petição",
  carta_precatoria: "Carta precatória",
  outro: "Outro",
};
export const DILIGENCIA_TIPO_OPTIONS = Object.entries(DILIGENCIA_TIPO_LABELS)
  .map(([value, label]) => ({ value, label }));

/** CHECK diligencias_status_check */
export const DILIGENCIA_STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "p" },
  cumprida: { label: "Cumprida", cls: "ok" },
  prejudicada: { label: "Prejudicada", cls: "d" },
};

/* ─── Card 13: lembretes de audiência ─────────────────────────────────────── */

/** CHECK audiencia_lembretes_canal_check */
export const LEMBRETE_CANAL_LABELS: Record<string, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  outro: "Outro",
};

/** CHECK audiencia_lembretes_status_check.
 *  `nao_atendeu` é o estado que IMPORTA: mantém a pendência ABERTA para nova
 *  tentativa — diferente de `cancelado`, que encerra. A UI tem de deixar isso
 *  explícito, senão os dois parecem "não deu certo". */
export const LEMBRETE_STATUS_META: Record<string, { label: string; cls: string; encerra: boolean }> = {
  pendente: { label: "Pendente", cls: "p", encerra: false },
  feito: { label: "Feito", cls: "ok", encerra: true },
  nao_atendeu: { label: "Não atendeu", cls: "d", encerra: false },
  cancelado: { label: "Cancelado", cls: "n", encerra: true },
};
/** Escolhíveis ao registrar (o `pendente` é o estado inicial, não uma decisão). */
export const LEMBRETE_ACAO_OPTIONS = ["feito", "nao_atendeu", "cancelado"]
  .map(value => ({ value, label: LEMBRETE_STATUS_META[value].label }));

/* ─── Card 14: apólices SUSEP ─────────────────────────────────────────────── */

/** CHECK apolices_seguro_premio_periodicidade_check.
 *  ATENÇÃO: `premio_mensal_somado` da RPC soma SÓ `mensal`. Periodicidade inválida
 *  é coagida para `outro` em silêncio, e aí o valor desaparece do total sem aviso —
 *  por isso o seletor não aceita texto livre. */
export const PREMIO_PERIODICIDADE_LABELS: Record<string, string> = {
  mensal: "Mensal",
  unico: "Único",
  anual: "Anual",
  outro: "Outro",
};
export const PREMIO_PERIODICIDADE_OPTIONS = Object.entries(PREMIO_PERIODICIDADE_LABELS)
  .map(([value, label]) => ({ value, label }));

/** CHECK apolices_seguro_origem_desconto_check */
export const ORIGEM_DESCONTO_LABELS: Record<string, string> = {
  extrato_inss: "Extrato do INSS",
  conta_bancaria: "Conta bancária",
  contracheque: "Contracheque",
  outro: "Outro",
};
export const ORIGEM_DESCONTO_OPTIONS = Object.entries(ORIGEM_DESCONTO_LABELS)
  .map(([value, label]) => ({ value, label }));

/**
 * `reconhecida` tem TRÊS estados e a UI precisa distinguir os três.
 * Tratar `null` como "não" seria MENTIR sobre o dado: "não reconhece" é a tese
 * (insumo da ação), "não perguntado" é trabalho pendente na próxima ligação.
 */
export type Reconhecida = boolean | null;
export function reconhecidaMeta(v: Reconhecida): { label: string; cls: string; icone: string } {
  if (v === true) return { label: "Reconhece", cls: "ok", icone: "✅" };
  if (v === false) return { label: "NÃO reconhece", cls: "d", icone: "❌" };
  return { label: "Não perguntado", cls: "n", icone: "⚪" };
}

/* ─── Card 15: procurações ────────────────────────────────────────────────── */

/** CHECK procuracoes_tipo_check.
 *  Tipo inválido NÃO é recusado pela RPC: o CASE do corpo cai em `ELSE 'outro'`, ou
 *  seja, é coagido para **outro** em silêncio. `ad_judicia` é o default de OUTRO caso:
 *  quando `p_tipo` chega NULL (o coalesce). Daí o seletor fechado — e daí este
 *  comentário estar corrigido: a versão anterior dizia ad_judicia e mandaria a próxima
 *  tela para o default errado. */
export const PROCURACAO_TIPO_LABELS: Record<string, string> = {
  ad_judicia: "Ad judicia",
  ad_judicia_et_extra: "Ad judicia et extra",
  especifica: "Específica",
  outro: "Outro",
};
export const PROCURACAO_TIPO_OPTIONS = Object.entries(PROCURACAO_TIPO_LABELS)
  .map(([value, label]) => ({ value, label }));

/** CHECK procuracoes_status_check */
export const PROCURACAO_STATUS_META: Record<string, { label: string; cls: string }> = {
  vigente: { label: "Vigente", cls: "ok" },
  vencida: { label: "Vencida", cls: "d" },
  renovada: { label: "Renovada", cls: "n" },
  revogada: { label: "Revogada", cls: "n" },
};

/** CHECK procuracoes_validade_meses_check */
export const VALIDADE_MESES_MIN = 1;
export const VALIDADE_MESES_MAX = 120;
export const VALIDADE_MESES_DEFAULT = 12;

/**
 * Semáforo da vigência pelos DIAS PARA VENCER (não pelo status, que pode estar
 * defasado até o cron rodar): verde > 30 · amarelo ≤ 30 · vermelho vencida.
 * `dias` negativo = já venceu.
 */
export function vigenciaMeta(dias: number | null): { label: string; cls: string } {
  if (dias === null) return { label: "sem validade calculada", cls: "n" };
  if (dias < 0) return { label: `vencida há ${Math.abs(dias)} dia(s)`, cls: "d" };
  if (dias === 0) return { label: "vence hoje", cls: "d" };
  if (dias <= 30) return { label: `vence em ${dias} dia(s)`, cls: "p" };
  return { label: `vigente por ${dias} dia(s)`, cls: "ok" };
}
