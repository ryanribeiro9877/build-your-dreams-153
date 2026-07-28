// Escolha DETERMINÍSTICA do agente que vai executar a ação de um objeto.
//
// Invariante (incidente da credencial, 27/07): se o objeto tem tool, o alvo TEM de
// portar essa tool — preferindo o assistant_root ("Meu Assistente") do próprio
// usuário — E também as tools de APOIO necessárias para cumprir o pedido. O
// incidente nasceu de um alvo que tinha a tool da ação mas não a de apoio: ele
// recusou "por falta de ferramenta" e parte do pedido silenciosamente não aconteceu.
//
// Extraído do index.ts para poder ser testado sem banco.

export interface AgentLike {
  id: string;
  name: string;
  role: string;
  allowed_tools?: string[] | null;
  owner_user_id?: string | null;
}

const has = (a: AgentLike, t: string) => (a.allowed_tools ?? []).includes(t);
const isRoot = (a: AgentLike) => a.role === "assistant_root" || a.role === "ceo";
const cobertura = (a: AgentLike, support: string[]) => support.filter((t) => has(a, t)).length;

/**
 * @param own agentes do PRÓPRIO usuário (qualquer papel)
 * @param global agentes globais (owner NULL)
 * @param tool tool obrigatória da ação
 * @param support tools de apoio desejáveis
 */
export function pickAgentForTool(
  own: AgentLike[], global: AgentLike[], tool: string, support: string[] = [],
): AgentLike | null {
  const portadores = (own ?? []).filter((a) => has(a, tool));
  const completo = (list: AgentLike[]) => list.find((a) => support.every((t) => has(a, t))) ?? null;
  const porCobertura = (list: AgentLike[]) =>
    [...list].sort((a, b) => cobertura(b, support) - cobertura(a, support));

  const roots = portadores.filter(isRoot);
  // 1. assistant_root do usuário, se cobrir TODO o kit (alvo preferencial e estável).
  const rootCompleto = completo(roots);
  if (rootCompleto) return rootCompleto;
  // 2. especialista do usuário que cubra todo o kit (líder antes de "(Rascunho)").
  const esp = portadores.filter((a) => !isRoot(a));
  const espCompleto = completo(porCobertura(esp.filter((a) => !/rascunho/i.test(a.name))))
    ?? completo(porCobertura(esp));
  if (espCompleto) return espCompleto;
  // 3. ninguém cobre tudo: assistant_root e, na falta, o melhor coberto.
  if (roots.length) return roots[0];
  if (esp.length) {
    const lider = porCobertura(esp.filter((a) => !/rascunho/i.test(a.name)));
    return lider[0] ?? porCobertura(esp)[0];
  }
  // 4. agentes GLOBAIS (ex.: Especialista Distribuição).
  const gl = porCobertura((global ?? []).filter((a) => has(a, tool)));
  return gl[0] ?? null;
}
