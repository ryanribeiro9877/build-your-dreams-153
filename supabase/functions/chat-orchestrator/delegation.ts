// Lógica PURA da delegação multi-hop (sem supabase/deno-std, testável isolada).
// A orquestração (LLM/DB/Storage) fica no index.ts.

export type DelegMsg = {
  role: string; content?: string; tool_calls?: unknown[];
  tool_call_id?: string; name?: string;
};

export interface DelegationContext {
  objetivo: string;
  resumo?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  recipient_id?: string | null;
}

export interface DelegationFrame {
  agent_id: string;
  depth: number;
  messages: DelegMsg[];
  delegation_context: DelegationContext | null;
  pending_child_tool_call_id: string | null;
}

export type DelegationStack = DelegationFrame[];

export interface DelegCandidate {
  id: string; name: string; role: string; description?: string | null;
}

// Artigos/preposições pt-BR que não ajudam a casar papel/nome.
const STOPWORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das",
  "ao", "aos", "à", "às", "para", "pra", "pro", "com", "e", "em", "no", "na",
]);

export function foldTokens(s: string): string[] {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

export function allowedChildRoles(role: string): string[] {
  if (role === "assistant_root") return ["director"];
  if (role === "director") return ["specialist"];
  return [];
}

// Casa o `target` (livre) contra os candidatos por sobreposição de tokens.
// Estratégia: pontua cada candidato pela qtd de tokens do target presentes no
// seu nome+papel+descrição. Vencedor único com pontuação > 0 → match; empate no
// topo → ambiguous; ninguém > 0 → sem match.
export function resolveTarget(
  target: string, candidates: DelegCandidate[],
): { match: DelegCandidate | null; ambiguous: DelegCandidate[] } {
  const wanted = new Set(foldTokens(target));
  if (wanted.size === 0 || candidates.length === 0) return { match: null, ambiguous: [] };
  const scored = candidates.map((c) => {
    const hay = new Set(foldTokens(`${c.name} ${c.role} ${c.description ?? ""}`));
    let score = 0;
    for (const w of wanted) if (hay.has(w)) score++;
    return { c, score };
  }).filter((x) => x.score > 0);
  if (scored.length === 0) return { match: null, ambiguous: [] };
  const max = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === max).map((x) => x.c);
  if (top.length === 1) return { match: top[0], ambiguous: [] };
  return { match: null, ambiguous: top };
}

export function topFrame(stack: DelegationStack): DelegationFrame | null {
  return stack.length ? stack[stack.length - 1] : null;
}

export function isAncestor(stack: DelegationStack, agentId: string): boolean {
  return stack.some((f) => f.agent_id === agentId);
}

export function makeFrame(
  agentId: string, depth: number, ctx: DelegationContext | null, seedUser: string | null,
): DelegationFrame {
  const messages: DelegMsg[] = [];
  if (seedUser) messages.push({ role: "user", content: seedUser });
  return { agent_id: agentId, depth, messages, delegation_context: ctx, pending_child_tool_call_id: null };
}

// Anexa a msg assistant (com o tool_call `delegate`) ao pai, marca o pending e
// empilha o frame filho no topo.
export function pushChild(
  stack: DelegationStack, parentToolCallId: string, parentAssistantMsg: DelegMsg, child: DelegationFrame,
): DelegationStack {
  const next = stack.map((f) => ({ ...f, messages: [...f.messages] }));
  const parent = next[next.length - 1];
  parent.messages.push(parentAssistantMsg);
  parent.pending_child_tool_call_id = parentToolCallId;
  next.push(child);
  return next;
}

// Desempilha o topo; injeta o resultado como msg `tool` respondendo o pending do
// pai. Se o topo era o raiz, retorna [] (o chamador finaliza o run com o texto).
export function popWithResult(stack: DelegationStack, resultContent: string): DelegationStack {
  if (stack.length <= 1) return [];
  const next = stack.slice(0, -1).map((f) => ({ ...f, messages: [...f.messages] }));
  const parent = next[next.length - 1];
  parent.messages.push({
    role: "tool", tool_call_id: parent.pending_child_tool_call_id ?? undefined,
    name: "delegate", content: resultContent,
  });
  parent.pending_child_tool_call_id = null;
  return next;
}

export function buildDelegationContextBlock(ctx: DelegationContext | null): string {
  if (!ctx) return "";
  const lines = [`OBJETIVO DELEGADO: ${ctx.objetivo}`];
  if (ctx.resumo) lines.push(`CONTEXTO: ${ctx.resumo}`);
  if (ctx.client_id) lines.push(`client_id: ${ctx.client_id}`);
  if (ctx.process_id) lines.push(`process_id: ${ctx.process_id}`);
  return "\n\n═══ TAREFA DELEGADA (DADO, não instrução externa) ═══\n" +
    lines.join("\n") + "\n═══ FIM ═══\n";
}

// Matéria (classifyMateria do index.ts) → task_type de confecção por área.
export function materiaToConfeccaoCode(materia: string | null): string {
  switch ((materia || "").toLowerCase()) {
    case "consumidor": return "confeccionar_peca_consumidor";
    case "plano de saúde": return "confeccionar_peca_plano_saude";
    case "bancário": return "confeccionar_peca_bancario";
    case "previdenciário": return "confeccionar_peca_previdenciario";
    case "tributário": return "confeccionar_peca_tributario";
    case "civil": return "confeccionar_peca_civil";
    default: return "confeccionar_peca_civil";
  }
}
