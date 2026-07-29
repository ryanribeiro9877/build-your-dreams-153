/* ============================================================
   Motor 1 — vocabulário de segmentação bancária e campanhas
   ============================================================
   Fonte única dos rótulos e dos CÓDIGOS aceitos pelo banco. Todo
   `value` aqui é o código EXATO gravado na coluna e validado por um
   CHECK em produção (lidos do banco em 29/07/2026) — renomear um
   value derruba a gravação com 23514, não é ajuste cosmético.

   Os mesmos códigos são usados pelas tools do chat
   (supabase/functions/chat-orchestrator/tools/campanhaFiltro.ts);
   se um lado mudar, o outro tem de mudar junto.
============================================================ */

/** CHECK client_bank_relations_tipo_relacao_check */
export const TIPO_RELACAO_LABELS: Record<string, string> = {
  beneficio: "Benefício",
  consignado: "Consignado",
  emprestimo_pessoal: "Empréstimo pessoal",
  cartao_consignado: "Cartão consignado",
  seguro: "Seguro",
  conta: "Conta",
  outro: "Outro",
};

export const TIPO_RELACAO_OPTIONS = Object.entries(TIPO_RELACAO_LABELS)
  .map(([value, label]) => ({ value, label }));

/** CHECK campanhas_objetivo_check */
export const CAMPANHA_OBJETIVO_LABELS: Record<string, string> = {
  pedir_documento: "Pedir documento",
  pedir_senha_gov: "Pedir senha do Gov.br",
  agendar_atendimento: "Agendar atendimento",
  renovar_procuracao: "Renovar procuração",
  converter_conta_bronze: "Converter conta bronze",
  informar_andamento: "Informar andamento",
  outro: "Outro",
};

export const CAMPANHA_OBJETIVO_OPTIONS = Object.entries(CAMPANHA_OBJETIVO_LABELS)
  .map(([value, label]) => ({ value, label }));

/** CHECK campanhas_status_check */
export const CAMPANHA_STATUS_META: Record<string, { label: string; cls: string }> = {
  ativa: { label: "Ativa", cls: "ok" },
  pausada: { label: "Pausada", cls: "p" },
  concluida: { label: "Concluída", cls: "n" },
  cancelada: { label: "Cancelada", cls: "d" },
};

/** CHECK campanha_itens_status_check */
export const CAMPANHA_ITEM_STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "p" },
  em_andamento: { label: "Em andamento", cls: "n" },
  concluido: { label: "Concluído", cls: "ok" },
  descartado: { label: "Descartado", cls: "d" },
};

/** CHECK ligacoes_resultado_check */
export const LIGACAO_RESULTADO_META: Record<string, { label: string; cls: string }> = {
  atendeu: { label: "Atendeu", cls: "ok" },
  nao_atendeu: { label: "Não atendeu", cls: "p" },
  numero_errado: { label: "Número errado", cls: "d" },
  retornar: { label: "Retornar", cls: "n" },
  recusou: { label: "Recusou", cls: "d" },
  caixa_postal: { label: "Caixa postal", cls: "p" },
};

export const LIGACAO_RESULTADO_OPTIONS = Object.entries(LIGACAO_RESULTADO_META)
  .map(([value, meta]) => ({ value, label: meta.label }));

/**
 * Chaves de filtro que `search_clients` REALMENTE entende. A RPC ignora chave
 * desconhecida em SILÊNCIO (devolvendo a base toda em vez de erro), então
 * qualquer filtro montado na mão precisa sair desta lista.
 */
export const SEARCH_CLIENTS_BANK_KEYS = ["recebe_em", "tem_consignado_com", "tem_extrato_de"] as const;
