export interface ActionPerms { isMaster: boolean; canAssignTask: boolean; }

// Ferramentas que exigem permissão de atribuição (gate do create_user_task).
// criar_card_tarefa cria uma tarefa pessoal atribuída a outrem, logo segue o gate:
// quem não pode atribuir tem a ação roteada como pendência ao master.
//
// distribuir_caso NÃO entra aqui: distribuir é ato de TRIAGEM/roteamento da
// recepção (define o advogado responsável do caso), executado direto. Antes ele
// caía em 'pendencia' para a recepção (can_assign=false) → routeAsPendencia só
// criava um inter_assistant_request 'aprovar_acao_chat' sem consumidor, então a
// RPC distribuir_caso nunca rodava e o caso não aparecia para ninguém. A exposição
// da tool já é gated por-agente (allowed_tools do Especialista Distribuição).
const NEEDS_ASSIGN = new Set(["criar_card_tarefa"]);

export function decideActionRoute(perms: ActionPerms, tool: string): "execute" | "pendencia" {
  if (NEEDS_ASSIGN.has(tool)) {
    return perms.isMaster || perms.canAssignTask ? "execute" : "pendencia";
  }
  return "execute"; // cadastrar_cliente, solicitar_documentos, pedir_acesso_arquivos: qualquer autenticado
}
