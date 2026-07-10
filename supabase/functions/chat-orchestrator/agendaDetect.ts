// Detectores DETERMINÍSTICOS (regex; sem LLM) para curto-circuitar o roteamento
// ANTES do classificador. Como rodam SEMPRE (independem de flag) e sequestram a
// mensagem do fluxo normal, priorizam PRECISÃO sobre recall: exigem um objeto
// EXPLÍCITO de reunião (reunião/atendimento/consulta) — exceto reagendar/remarcar,
// que já são específicos de compromisso. Assim "realizar tarefa amanhã", "ver a
// agenda de hoje" ou "confirma o pagamento" NÃO são capturados. A guarda
// looksLikePecaRequest vence em ambiguidade.
//
// Precedência (aplicada em index.ts): AÇÃO/CICLO antes de AGENDAR — "marca como
// realizada a reunião" é flip de status, não novo agendamento.
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Termos de PEÇA (redação jurídica) — se presentes, NUNCA é agenda/ciclo.
const PECA = /\b(peticao|inicial|contestacao|recurso|apelacao|agravo|parecer|contrato|procuracao|manifestacao|embargos|impugnacao|defesa|contrarrazoes|razoes)\b/;
export function looksLikePecaRequest(msg: string): boolean {
  return PECA.test(norm(msg));
}

// Objeto EXPLÍCITO de reunião. NÃO inclui "agenda" (o substantivo calendário
// gera falso-positivo em "ver a agenda de hoje").
const MEETING_OBJ = /\b(reuniao|reunioes|atendimento|consulta)\b/;

// AGENDAR: verbo de marcar + objeto de reunião.
const AGENDA_VERB = /\b(agenda|agendar|agende|marca|marcar|marque)\b/;
export function isAgendarAtendimentoRequest(msg: string): boolean {
  const n = norm(msg);
  if (looksLikePecaRequest(msg)) return false;
  return AGENDA_VERB.test(n) && MEETING_OBJ.test(n);
}

// AÇÃO/CICLO. Reagendar/remarcar é específico de compromisso → basta sozinho.
// Os demais verbos de ciclo são genéricos em pt-BR (confirmar/cancelar/realizar/
// faltar) → exigem o objeto explícito de reunião para evitar sequestrar tarefas,
// pagamentos, etc.
const ACAO_RESCHEDULE = /\b(reagenda(r)?|reagende|remarca(r)?|remarque)\b/;
const ACAO_VERB = /\b(confirma(r)?|confirme|confirmad[ao]|cancela(r)?|cancele|cancelad[ao]|realizad[ao]|realizou|realizar|compareceu|nao compareceu|nao veio|faltou|no.?show)\b/;
export function isReuniaoAcaoRequest(msg: string): boolean {
  const n = norm(msg);
  if (looksLikePecaRequest(msg)) return false;
  if (ACAO_RESCHEDULE.test(n)) return true;
  return ACAO_VERB.test(n) && MEETING_OBJ.test(n);
}
