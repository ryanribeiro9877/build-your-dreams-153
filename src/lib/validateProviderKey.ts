/**
 * validateProviderKey.ts
 *
 * Helper client-side que faz um ping no endpoint público do provedor LLM
 * para confirmar se a chave de API está ativa antes do cadastro no Vault.
 *
 * Estratégia por provedor:
 *  - OpenAI    → GET /v1/models     (header Authorization: Bearer)
 *  - OpenRouter→ GET /api/v1/models (header Authorization: Bearer)
 *  - Anthropic → GET /v1/models     (header x-api-key + anthropic-version)
 *  - Google    → GET /v1beta/models (param key=…)
 *  - Outros    → assume válido após sanity check de comprimento/prefixo
 *
 * Retorno:
 *  - { ok: true,  detail: "12 modelos visíveis" }     → chave funcional
 *  - { ok: false, detail: "401 Unauthorized" }        → chave inválida
 *  - { ok: null,  detail: "CORS bloqueado, valide ao cadastrar" }
 *      → não foi possível validar (provider sem CORS), permita o cadastro.
 *
 * Timeout de 8 s para não travar o formulário.
 */

import type { ProviderCode } from "@/types/jurisai";

export type ValidationResult = {
  /** true = válida, false = inválida, null = não foi possível validar */
  ok: boolean | null;
  detail: string;
};

const DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit, ms = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function validateProviderKey(
  provider: ProviderCode,
  apiKey: string,
): Promise<ValidationResult> {
  const trimmed = apiKey.trim();

  // Sanity check básico — chaves de provedor têm pelo menos 20 chars
  if (trimmed.length < 20) {
    return { ok: false, detail: "Chave muito curta (mínimo 20 caracteres)." };
  }

  // Prefix check rápido pra cada provedor (evita ping desnecessário se óbvio errado)
  const prefixCheck: Record<string, RegExp> = {
    openai: /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/,
    openrouter: /^sk-or-(v1-)?[A-Za-z0-9_-]{20,}$/,
    anthropic: /^sk-ant-(api03-)?[A-Za-z0-9_-]{20,}$/,
  };
  const rx = prefixCheck[provider];
  if (rx && !rx.test(trimmed)) {
    return {
      ok: false,
      detail: `Formato inválido para ${provider}. Verifique se copiou a chave inteira.`,
    };
  }

  try {
    if (provider === "openai") {
      const r = await fetchWithTimeout("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (r.status === 200) {
        try {
          const j = (await r.json()) as { data?: unknown[] };
          const n = Array.isArray(j.data) ? j.data.length : 0;
          return { ok: true, detail: `Chave válida — ${n} modelos visíveis.` };
        } catch {
          return { ok: true, detail: "Chave válida." };
        }
      }
      if (r.status === 401) return { ok: false, detail: "Chave rejeitada pela OpenAI (401)." };
      if (r.status === 403) return { ok: false, detail: "Sem permissão (403) — verifique escopos." };
      if (r.status === 429) return { ok: false, detail: "Rate-limit (429) — tente em alguns segundos." };
      return { ok: false, detail: `OpenAI respondeu ${r.status}.` };
    }

    if (provider === "openrouter") {
      const r = await fetchWithTimeout("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (r.status === 200) return { ok: true, detail: "Chave válida no OpenRouter." };
      if (r.status === 401) return { ok: false, detail: "Chave rejeitada pelo OpenRouter (401)." };
      return { ok: false, detail: `OpenRouter respondeu ${r.status}.` };
    }

    if (provider === "anthropic") {
      // Anthropic exige x-api-key + anthropic-version. CORS é permitido.
      const r = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": trimmed,
          "anthropic-version": "2023-06-01",
        },
      });
      if (r.status === 200) return { ok: true, detail: "Chave válida na Anthropic." };
      if (r.status === 401) return { ok: false, detail: "Chave rejeitada pela Anthropic (401)." };
      return { ok: false, detail: `Anthropic respondeu ${r.status}.` };
    }

    if (provider === "google") {
      const r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`,
        { method: "GET" },
      );
      if (r.status === 200) return { ok: true, detail: "Chave válida no Google AI." };
      if (r.status === 400 || r.status === 401 || r.status === 403)
        return { ok: false, detail: `Chave rejeitada pelo Google (${r.status}).` };
      return { ok: false, detail: `Google respondeu ${r.status}.` };
    }

    // Outros provedores: não temos endpoint de listagem público — só passa o sanity check.
    return { ok: null, detail: "Validação remota não disponível para este provedor." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) {
      return { ok: null, detail: "Tempo esgotado (8 s) ao validar — pode ser CORS." };
    }
    // Erro de rede / CORS — não conseguimos confirmar, mas não dá pra dizer que é inválida.
    return { ok: null, detail: "Não foi possível validar via navegador (CORS/rede)." };
  }
}
