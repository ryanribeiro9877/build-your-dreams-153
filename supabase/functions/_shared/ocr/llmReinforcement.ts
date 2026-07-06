// supabase/functions/_shared/ocr/llmReinforcement.ts
//
// Passe de reforço por LLM (§2.3 do briefing): SÓ para os campos que a regra
// determinística não pegou (layout bagunçado). Manda o TEXTO já extraído —
// NUNCA a imagem — e o mínimo necessário.
//
// REGRA DURA: vai a OpenAI DIRETO. O provider do projeto é derivado do
// formato do model_id (com "/" → OpenRouter; sem "/" → OpenAI). OpenRouter é
// trajeto opaco (reencaminha a sub-provedores; dossiê D3) e está PROIBIDO
// aqui. `assertOpenAiDirect` recusa qualquer modelo que roteie para OpenRouter.

import type { LlmReinforcementFn } from "./types.ts";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Garante que o modelo vai para OpenAI DIRETO. Um "/" no id rotearia para
 * OpenRouter (mesma derivação `providerFromModel` do orquestrador). Lança se
 * o modelo não for OpenAI-direto.
 */
export function assertOpenAiDirect(model: string): void {
  if (!model || !model.trim()) {
    throw new Error("OCR_LLM_MODEL vazio: defina um modelo OpenAI direto (sem barra).");
  }
  if (model.includes("/")) {
    throw new Error(
      `Reforço de OCR proibido via OpenRouter (modelo "${model}" contém "/"). ` +
        "Use um modelo OpenAI DIRETO, sem barra (trajeto opaco — dossiê D3).",
    );
  }
}

interface OpenAiReinforcementDeps {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Injetável para teste; default = fetch global. */
  fetchImpl?: typeof fetch;
}

/**
 * Cria um LlmReinforcementFn que chama a OpenAI DIRETO. Envia o texto extraído
 * e as chaves faltantes; pede JSON estrito. Nunca envia imagem.
 */
export function makeOpenAiReinforcement(deps: OpenAiReinforcementDeps): LlmReinforcementFn {
  assertOpenAiDirect(deps.model);
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async ({ text, missingKeys, sourceDocument }) => {
    if (missingKeys.length === 0) return [];

    const system =
      "Você extrai campos de um texto JÁ EXTRAÍDO de documento brasileiro (OCR). " +
      "Responda SOMENTE JSON no formato {\"fields\":[{\"key\":\"...\",\"value\":\"...\",\"confidence\":0.0}]}. " +
      "confidence em [0,1] reflete SUA certeza. Se não encontrar um campo, NÃO o inclua. " +
      "Nunca invente valores; prefira omitir a chutar.";
    const user =
      `Documento: ${sourceDocument}\n` +
      `Campos desejados (só estes): ${missingKeys.join(", ")}\n\n` +
      `Texto:\n${text}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await doFetch(OPENAI_ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deps.apiKey}`,
        },
        body: JSON.stringify({
          model: deps.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      const raw = Array.isArray(parsed?.fields) ? parsed.fields : [];
      const wanted = new Set(missingKeys);
      const out: Array<{ key: string; value: string; confidence: number }> = [];
      for (const f of raw) {
        if (!f || typeof f.key !== "string" || typeof f.value !== "string") continue;
        if (!wanted.has(f.key)) continue; // só o que foi pedido
        const c = Number(f.confidence);
        out.push({
          key: f.key,
          value: f.value,
          confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5,
        });
      }
      return out;
    } finally {
      clearTimeout(timer);
    }
  };
}
