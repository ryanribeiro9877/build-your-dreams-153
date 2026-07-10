// Detectores DETERMINÍSTICOS (regex; sem LLM) para curto-circuitar o roteamento
// ANTES do classificador. Conservadores: na dúvida NÃO capturam (deixam seguir o
// fluxo normal) para não sequestrar pedido de peça. A guarda looksLikePecaRequest
// vence em ambiguidade.
//
// Precedência (aplicada em index.ts): AÇÃO/CICLO antes de AGENDAR. Assim
// "marca como realizada a reunião" (que casa os dois) é tratado como flip de
// status, não como novo agendamento.
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Termos de PEÇA (redação jurídica) — se presentes, NUNCA é agenda/ciclo.
const PECA = /\b(peticao|inicial|contestacao|recurso|apelacao|agravo|parecer|contrato|procuracao|manifestacao|embargos|impugnacao|defesa|contrarrazoes|razoes)\b/;
export function looksLikePecaRequest(msg: string): boolean {
  return PECA.test(norm(msg));
}

// AGENDAR: verbo de marcar (agendar) + objeto reunião/atendimento/consulta.
// NÃO inclui remarca/reagenda (isso é ciclo/reschedule).
const AGENDA_OBJ = /\b(reuniao|reunioes|atendimento|consulta|agenda)\b/;
const AGENDA_VERB = /\b(agenda|agendar|agende|marca|marcar|marque)\b/;
export function isAgendarAtendimentoRequest(msg: string): boolean {
  const n = norm(msg);
  if (looksLikePecaRequest(msg)) return false;
  return AGENDA_VERB.test(n) && AGENDA_OBJ.test(n);
}

// AÇÃO/CICLO: verbos FORTES (inequívocos do ciclo de reunião) bastam sozinhos;
// verbos FRACOS (confirma/cancela) exigem contexto de reunião/horário/dia.
const ACAO_STRONG = /\b(nao compareceu|nao veio|faltou|no.?show|realizad[ao]|realizou|realizar|reagenda(r)?|reagende|remarca(r)?|remarque)\b/;
const ACAO_WEAK = /\b(confirma(r)?|confirme|confirmad[ao]|cancela(r)?|cancele|cancelad[ao])\b/;
const CTX = /\b(reuniao|reunioes|atendimento|consulta|agenda|amanha|hoje|\d{1,2}\s*h\b|\d{1,2}:\d{2})\b/;
export function isReuniaoAcaoRequest(msg: string): boolean {
  const n = norm(msg);
  if (looksLikePecaRequest(msg)) return false;
  if (ACAO_STRONG.test(n)) return true;
  return ACAO_WEAK.test(n) && CTX.test(n);
}
