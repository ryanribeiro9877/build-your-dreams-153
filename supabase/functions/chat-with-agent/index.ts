// supabase/functions/chat-with-agent/index.ts
//
// Roteador hibrido para o sistema de agentes JurisAI.
//
// Fluxo:
//   1. Autentica o usuario via JWT (Supabase service_role para ler agents/depts).
//   2. Recebe { requestId, deptId, message, history } do front.
//   3. Classifica a intencao (LLM ou regra) e decide o papel responsavel:
//      - CEO/Diretor/Gerente -> orquestracao via OpenClaw (webhook configuravel)
//      - Executor especialista -> chamada direta a Claude
//   4. Persiste tudo em agent_orchestration_log (com user_id, RLS-safe).
//   5. Retorna { agent, content, orchestration: [...] } para o front.
//
// Variaveis de ambiente esperadas:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ja existem)
//   - ANTHROPIC_API_KEY (executores e classificacao)
//   - OPENCLAW_WEBHOOK_URL (orquestracao Brat Ventures)
//   - OPENCLAW_WEBHOOK_TOKEN (auth bearer)
//
// Comportamento defensivo:
//   - Se OPENCLAW indisponivel: cai para executor direto com aviso.
//   - Se ANTHROPIC_API_KEY ausente: retorna erro estruturado (front fara refund).
//   - Timeout total 25s (Supabase Edge limit ~30s).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatRequest {
  requestId: string;
  deptId: string;
  message: string;
  history?: { role: string; content?: string; agent?: string }[];
}

interface OrchestrationStep {
  agent: string;
  role: string;
  action: string;
  ms: number;
}

// -- Helpers ------------------------------------------------------------------

async function callClaude(systemPrompt: string, userMessage: string, history: ChatRequest["history"]): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada");

  // Build messages from history (drop nulls, keep last 8).
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of (history || []).slice(-8)) {
    if (!h.content) continue;
    messages.push({
      role: h.role === "user" ? "user" : "assistant",
      content: h.content,
    });
  }
  messages.push({ role: "user", content: userMessage });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 22_000);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      }),
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data = (await resp.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    if (!text) throw new Error("Resposta vazia do modelo");
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenClaw(payload: Record<string, unknown>): Promise<string | null> {
  const url = Deno.env.get("OPENCLAW_WEBHOOK_URL");
  const token = Deno.env.get("OPENCLAW_WEBHOOK_TOKEN");
  if (!url) return null; // fallback: caller decides

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      console.error("OpenClaw HTTP", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = await resp.json().catch(() => ({}));
    return data.content || data.response || null;
  } catch (e) {
    console.error("OpenClaw fail:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// -- System prompts por departamento -----------------------------------------

function systemPromptForDept(deptName: string, deptDescription: string | null): string {
  const base = `Voce e um agente de IA juridica do sistema JurisAI, operando no departamento "${deptName}"${deptDescription ? ` (${deptDescription})` : ""}.

REGRAS INEGOCIAVEIS:
- Voce e auxiliar tecnico. NUNCA toma decisao final por advogado humano.
- NUNCA inventa jurisprudencia, numeros de processo, valores ou datas. Se nao tem certeza, diz que nao tem.
- NUNCA promete resultado processual.
- Toda peca/calculo/comunicacao que voce produz e MINUTA para revisao humana, nao versao final.
- Respeita sigilo profissional (EAOAB art. 34, VII) e LGPD.
- Se a pergunta sai do escopo juridico do departamento, voce diz isso e sugere o departamento certo.
- Responde em portugues brasileiro, tom profissional e objetivo.

FORMATO DE RESPOSTA:
- Maximo 6 paragrafos. Vai direto ao ponto.
- Pode usar **negrito** em pontos criticos (prazos, valores, riscos).
- Quando aplicavel, termina com "Proximos passos sugeridos:" e 1-3 acoes para o advogado decidir.
`;

  const specifics: Record<string, string> = {
    civel: "Sua especialidade: processo civil, consumidor, contratos, indenizatorias. Conhece CPC, CDC, jurisprudencia STJ.",
    trabalhista: "Sua especialidade: CLT, processo do trabalho, calculos de rescisao, jurisprudencia TST.",
    tributario: "Sua especialidade: tributos federais/estaduais/municipais, processo administrativo fiscal, jurisprudencia CARF/STJ.",
    calculos: "Sua especialidade: calculos juridicos (rescisao, atualizacao monetaria, juros, contadoria). Mostra a memoria de calculo passo a passo.",
    audiencias: "Sua especialidade: preparacao de audiencias, peticoes para audiencia, controle de pauta.",
    monitoramento: "Sua especialidade: leitura de andamentos processuais, classificacao por urgencia e tipo de acao requerida.",
    protocolo: "Sua especialidade: requisitos formais de protocolo eletronico (PJe, projudi, e-SAJ), checagem de pecas antes do envio.",
    familia: "Sua especialidade: direito de familia e sucessoes, alimentos, guarda, inventario.",
    compliance: "Sua especialidade: LGPD, compliance interno, politica de privacidade, contratos de tratamento de dados.",
    financeiro: "Sua especialidade: financeiro interno do escritorio. Nao da consultoria financeira a clientes.",
    cobrancas: "Sua especialidade: cobranca de honorarios, conciliacao, parcelamento.",
    recepcao: "Sua especialidade: triagem inicial de leads, qualificacao, agendamento, coleta de documentos.",
    marketing: "Sua especialidade: marketing juridico DENTRO dos limites do Provimento 205/2021 CFOAB. Nunca sugere captacao ou mercantilizacao.",
    criacao: "Sua especialidade: criacao de conteudo institucional respeitando regras de publicidade da advocacia.",
    conversao: "Sua especialidade: melhoria de jornada do lead institucional (sem captacao).",
    tech: "Sua especialidade: integracoes tecnicas, dados, observabilidade da plataforma.",
    eficiencia: "Sua especialidade: identificar gargalos operacionais e sugerir otimizacoes.",
    diretoria: "Voce e Diretor: organiza, prioriza, delega entre gerentes. Resposta executiva e curta.",
    assistente: "Voce e o assistente principal do advogado. Roteia, consolida, traduz pedido em acoes.",
  };

  return base + "\n" + (specifics[deptName] || "Responda dentro do escopo geral juridico.");
}

// ----------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth: use o JWT do usuario via anon client para identificar quem chama.
  const authHeader = req.headers.get("authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Nao autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON invalido" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  if (!body.requestId || !body.deptId || !body.message) {
    return new Response(JSON.stringify({ error: "Campos obrigatorios faltando" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  if (body.message.length > 4000) {
    return new Response(JSON.stringify({ error: "Mensagem excede 4000 caracteres" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Resolve departamento (preferimos name, mas aceita por id).
  const { data: dept } = await admin
    .from("departments")
    .select("id, name, description")
    .or(`name.eq.${body.deptId},id.eq.${body.deptId}`)
    .maybeSingle();

  const deptName = dept?.name || body.deptId;
  const deptDescription = dept?.description || null;

  // Decisao de roteamento. Heuristica simples + flag de orquestracao.
  // Orquestracao via OpenClaw quando: departamento e "assistente" OR "diretoria",
  // OU mensagem comeca com palavras como "delegue", "coordene", "atribua".
  const lower = body.message.toLowerCase();
  const useOrchestration = deptName === "assistente"
    || deptName === "diretoria"
    || /\b(delegue|delegar|coordene|coordenar|atribua|atribuir|distribua|orqu)/i.test(lower);

  const orchestration: OrchestrationStep[] = [];
  let agentName = "Assistente JurisAI";
  let content = "";

  const tStart = performance.now();

  try {
    if (useOrchestration) {
      orchestration.push({ agent: "CEO JurisAI", role: "ceo", action: "classificou intent", ms: 0 });
      const openClawResp = await callOpenClaw({
        userId,
        requestId: body.requestId,
        deptName,
        message: body.message,
        history: body.history,
      });
      if (openClawResp) {
        content = openClawResp;
        agentName = "CEO JurisAI";
        orchestration.push({ agent: "OpenClaw", role: "orchestrator", action: "respondeu", ms: Math.round(performance.now() - tStart) });
      } else {
        // Fallback: executor direto.
        orchestration.push({ agent: "Sistema", role: "monitor", action: "OpenClaw indisponivel, caindo para executor", ms: Math.round(performance.now() - tStart) });
        content = await callClaude(systemPromptForDept(deptName, deptDescription), body.message, body.history);
        agentName = `Especialista ${deptName}`;
        orchestration.push({ agent: agentName, role: "specialist", action: "respondeu via fallback", ms: Math.round(performance.now() - tStart) });
      }
    } else {
      // Executor direto.
      content = await callClaude(systemPromptForDept(deptName, deptDescription), body.message, body.history);
      agentName = `Especialista ${deptName}`;
      orchestration.push({ agent: agentName, role: "specialist", action: "respondeu", ms: Math.round(performance.now() - tStart) });
    }
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error("chat-with-agent failed:", errMsg);

    await admin.from("agent_orchestration_log").insert({
      user_id: userId,
      action: "chat_failed",
      details: {
        request_id: body.requestId,
        dept: deptName,
        error: errMsg,
        message_preview: body.message.slice(0, 80),
      },
    });

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 502,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Persistir orquestracao + mensagem.
  await admin.from("agent_orchestration_log").insert({
    user_id: userId,
    action: "chat_completed",
    details: {
      request_id: body.requestId,
      dept: deptName,
      agent: agentName,
      orchestration,
      ms_total: Math.round(performance.now() - tStart),
      message_preview: body.message.slice(0, 80),
      response_preview: content.slice(0, 120),
    },
  });

  return new Response(JSON.stringify({
    agent: agentName,
    content,
    orchestration,
  }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
