import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ============================================================================
   Observabilidade do turno — por que este arquivo existe
   ============================================================================
   Quando o agente diz "não tenho essa ferramenta", há TRÊS causas possíveis e o
   sintoma é idêntico:

     (a) a tool NÃO FOI ENVIADA ao LLM — estava em `agents.allowed_tools` mas não no
         registry do edge, então `toolsFor` a descartou em silêncio. Foi exatamente
         isso com `consultar_documentos_obrigatorios` (ativa no tool_catalog, em 13
         agentes, invisível para o modelo). Custou três hipóteses erradas em dois
         briefings;
     (b) foi enviada e o LLM NÃO A USOU — problema de instrução/classificação;
     (c) foi chamada e a RPC FALHOU — 42501 de papel, 23514 de vocabulário, 42883 de
         parâmetro errado. A mensagem chegava ao usuário sem o código, então "não
         consegui" cobria causas muito diferentes.

   Sem registro, cada ocorrência vira investigação. Com estes dois spans, vira uma
   consulta: `tools_enviadas` responde (a), `tool_calls` responde (b), o span de tool
   com `erro_cru` responde (c).

   PII: os traces gravam NOMES DE TOOL e CHAVES de argumento — nunca VALORES. Os args
   carregam nome de cliente, CPF e senha do gov.br; o repositório é público e o trace
   é legível pelo próprio usuário e por admin. `chavesDeArgs` existe para essa linha
   não ser cruzada por descuido.

   Escrita: `agent_traces` só tem policy de SELECT (própria ou admin), então o INSERT
   depende do client service_role — é o `admin` que o orquestrador já usa. Toda função
   aqui é BEST-EFFORT: falha de trace nunca derruba o turno (observabilidade que
   quebra o fluxo é pior que a falta dela).
============================================================================ */

/** span_kind aceito pelo CHECK de agent_traces (banco, 04/08/2026). */
type SpanKind = "llm" | "tool" | "retrieval" | "agent" | "chain" | "rag";
/** status aceito pelo CHECK. */
type SpanStatus = "running" | "ok" | "error" | "timeout" | "rate_limited" | "autonomia_blocked";

export interface TraceCtx {
  /** Um id por TURNO — amarra os spans do mesmo pedido do usuário. */
  traceId: string;
  userId: string;
  sessionId?: string | null;
  agentId?: string | null;
  runId?: string | null;
}

/** Id de turno. `crypto.randomUUID` existe no runtime do Deno das edges. */
export function novoTraceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback sem random: o trace_id não precisa ser único no universo, só dentro
    // da sessão — e um id repetido é melhor que derrubar o turno.
    return `t-${Date.now()}`;
  }
}

/**
 * CHAVES dos argumentos, ordenadas — nunca os valores.
 * `senha` é a razão mais óbvia, mas `cliente_nome`, `tese` e `observacao` também
 * carregam dado de cliente. Saber QUAIS campos vieram já resolve o diagnóstico de
 * parâmetro faltando/errado, que é para o que o trace serve.
 */
export function chavesDeArgs(args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  return Object.keys(args as Record<string, unknown>)
    .filter((k) => !k.startsWith("__"))   // internos do orquestrador (__attachment_id etc.)
    .sort();
}

/**
 * Erro CRU da RPC, achatado em uma linha legível: code + message + details + hint.
 * O supabase-js devolve os quatro e o código anterior repassava só `message` — e o
 * código é justamente o que distingue 42501 (papel) de 23514 (vocabulário) de 42883
 * (parâmetro que não existe).
 */
export function erroCru(error: unknown): string | null {
  if (!error) return null;
  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  const partes = [
    e.code ? `code=${e.code}` : null,
    e.message ? `message=${e.message}` : null,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : String(error).slice(0, 300);
}

/**
 * Campos cujo VALOR nunca entra no trace, por nome. A prévia do retorno precisa
 * mostrar nome de cliente e data (é o que torna a linha diagnosticável), mas senha
 * e documento não ajudam em NADA a diagnosticar e são o pior de registrar.
 */
const CAMPOS_MASCARADOS = /^(senha|password|pass|pwd|cpf|cnpj|rg|token|secret|api_key|credencial|chave_pix)$/i;

/** Mascara por NOME de campo, em profundidade. Preserva a forma do objeto. */
function mascararSensiveis(v: unknown, nivel = 0): unknown {
  if (nivel > 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => mascararSensiveis(x, nivel + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = CAMPOS_MASCARADOS.test(k) ? "[omitido]" : mascararSensiveis(val, nivel + 1);
  }
  return out;
}

/**
 * FORMA do retorno em uma linha: é o que separa "rodou e voltou vazio" de "rodou e
 * voltou 165 linhas". Com `status: ok` e nada mais, sabia-se que executou e não o
 * que voltou — e era a peça que faltava para fechar o diagnóstico sem inferir.
 */
export function formaDoRetorno(result: unknown): string {
  if (result === null || result === undefined) return "nulo";
  if (Array.isArray(result)) return result.length === 0 ? "array(0) VAZIO" : `array(${result.length})`;
  if (typeof result === "string") return result.length === 0 ? "texto(0) VAZIO" : `texto(${result.length})`;
  if (typeof result === "object") {
    const chaves = Object.keys(result as Record<string, unknown>);
    if (chaves.length === 0) return "objeto{} VAZIO";
    // Nomes de chave são seguros e são o que diz se veio `erro` ou payload.
    return `objeto{${chaves.slice(0, 12).join(",")}}`;
  }
  return typeof result;
}

/** Prévia truncada do retorno, já mascarada. `limite` em caracteres. */
export function previaDoRetorno(result: unknown, limite = 600): string {
  let texto: string;
  try {
    texto = JSON.stringify(mascararSensiveis(result)) ?? "null";
  } catch {
    texto = "[não serializável]";
  }
  return texto.length <= limite ? texto : texto.slice(0, limite) + `…[+${texto.length - limite} chars]`;
}

async function inserirSpan(
  admin: SupabaseClient, ctx: TraceCtx,
  span: {
    kind: SpanKind; operation: string; status: SpanStatus;
    input?: string | null; output?: string | null; error?: string | null;
    durationMs?: number | null; metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    await admin.from("agent_traces").insert({
      user_id: ctx.userId,
      session_id: ctx.sessionId ?? null,
      agent_id: ctx.agentId ?? null,
      trace_id: ctx.traceId,
      span_id: novoTraceId(),
      span_kind: span.kind,
      operation_name: span.operation,
      input_summary: span.input ?? null,
      output_summary: span.output ?? null,
      error_message: span.error ?? null,
      // started_at é NOT NULL e SEM default no banco — tem de ir explícito.
      started_at: agora,
      ended_at: agora,
      duration_ms: span.durationMs ?? null,
      status: span.status,
      metadata: { ...(span.metadata ?? {}), run_id: ctx.runId ?? null },
    });
  } catch (e) {
    // Best-effort de propósito: trace não derruba turno.
    console.error("[trace] falha ao gravar span", span.operation, e);
  }
}

/**
 * O que o LLM RECEBEU como ferramenta, e o que ficou pelo caminho.
 *
 * `nao_registradas` é o campo que resolve a causa (a): tool que o agente tem em
 * allowed_tools mas o registry do edge não conhece. Ela é descartada por `toolsFor`
 * sem erro nenhum — antes disso só aparecia como "o agente não tem a ferramenta".
 */
export async function traceToolsEnviadas(
  admin: SupabaseClient, ctx: TraceCtx,
  dados: {
    operacao: string;
    agenteNome?: string | null;
    permitidas: string[];   // agents.allowed_tools, depois dos gates de flag
    enviadas: string[];     // o que virou schema de fato
    modelo?: string | null;
  },
): Promise<void> {
  const naoRegistradas = dados.permitidas.filter((n) => !dados.enviadas.includes(n));
  await inserirSpan(admin, ctx, {
    kind: "llm", operation: dados.operacao, status: "ok",
    input: `${dados.enviadas.length} tool(s) enviada(s)`,
    metadata: {
      agente: dados.agenteNome ?? null,
      modelo: dados.modelo ?? null,
      tools_enviadas: dados.enviadas,
      total_enviadas: dados.enviadas.length,
      // Só os nomes; nenhum schema, nenhum valor.
      nao_registradas: naoRegistradas,
      tem_nao_registrada: naoRegistradas.length > 0,
    },
  });
  if (naoRegistradas.length > 0) {
    // Alto valor no log também: é um defeito de configuração, não do usuário.
    console.error(`[tools] agente=${dados.agenteNome ?? "?"} tem ${naoRegistradas.length} tool(s) em allowed_tools que NÃO existem no registry do edge (descartadas em silêncio): ${naoRegistradas.join(", ")}`);
  }
}

/**
 * O que o LLM DEVOLVEU: chamou ferramenta ou respondeu texto?
 * É o que separa "não foi enviada" de "foi enviada e não usou".
 */
export async function traceRespostaLlm(
  admin: SupabaseClient, ctx: TraceCtx,
  dados: { operacao: string; toolCalls: string[]; temTexto: boolean; modelo?: string | null },
): Promise<void> {
  await inserirSpan(admin, ctx, {
    kind: "llm", operation: `${dados.operacao}:resposta`, status: "ok",
    output: dados.toolCalls.length
      ? `chamou ${dados.toolCalls.length} tool(s): ${dados.toolCalls.join(", ")}`
      : (dados.temTexto ? "respondeu TEXTO sem chamar ferramenta" : "resposta vazia"),
    metadata: {
      modelo: dados.modelo ?? null,
      tool_calls: dados.toolCalls,
      usou_ferramenta: dados.toolCalls.length > 0,
    },
  });
}

/**
 * Execução de UMA tool: nome, chaves dos args, e o erro CRU quando falha.
 * `erro_cru` traz o code da RPC — 42501/23514/42883 dizem em um olhar se foi papel,
 * vocabulário ou parâmetro errado.
 */
export async function traceChamadaTool(
  admin: SupabaseClient, ctx: TraceCtx,
  dados: {
    tool: string; args?: unknown; ok: boolean;
    erro?: unknown; motivo?: string | null; durationMs?: number | null;
    /** O que a tool devolveu. Vai como TAMANHO + FORMA + prévia mascarada. */
    retorno?: unknown;
  },
): Promise<void> {
  const cru = dados.ok ? null : erroCru(dados.erro);
  const temRetorno = "retorno" in dados;
  const forma = temRetorno ? formaDoRetorno(dados.retorno) : null;
  const previa = temRetorno ? previaDoRetorno(dados.retorno) : null;
  const bytes = temRetorno ? (previaDoRetorno(dados.retorno, 1_000_000)).length : null;
  await inserirSpan(admin, ctx, {
    kind: "tool", operation: `tool:${dados.tool}`,
    status: dados.ok ? "ok" : "error",
    input: `args: ${chavesDeArgs(dados.args).join(", ") || "(nenhum)"}`,
    // `ok` sozinho dizia que executou e não O QUE voltou. Agora a forma vem no
    // próprio output_summary: "array(0) VAZIO" e "array(165)" se distinguem em
    // um olhar, sem abrir o metadata.
    output: dados.ok ? (forma ? `ok · retorno=${forma}` : "ok") : null,
    error: cru ?? (dados.motivo ? `motivo=${dados.motivo}` : null),
    durationMs: dados.durationMs ?? null,
    metadata: {
      tool: dados.tool,
      args_chaves: chavesDeArgs(dados.args),
      motivo: dados.motivo ?? null,
      // `erro_cru` também no metadata para poder filtrar por code no SQL.
      erro_cru: cru,
      retorno_forma: forma,
      retorno_bytes: bytes,
      // Prévia com senha/CPF/CNPJ mascarados por nome de campo (ver
      // CAMPOS_MASCARADOS): nome de cliente e data ficam, porque são o que torna
      // a linha diagnosticável; documento e credencial não ajudam em nada aqui.
      retorno_previa: previa,
    },
  });
  if (!dados.ok) {
    console.error(`[tool] ${dados.tool} FALHOU — ${cru ?? dados.motivo ?? "sem detalhe"} | args: ${chavesDeArgs(dados.args).join(", ")}`);
  } else if (forma && forma.endsWith("VAZIO")) {
    // Alto valor: "rodou e não achou" é a resposta honesta que o agente deve dar
    // (guardrail F-quinquies) e a linha que confirma que ele podia dá-la.
    console.log(`[tool] ${dados.tool} ok mas retorno VAZIO | args: ${chavesDeArgs(dados.args).join(", ")}`);
  }
}
