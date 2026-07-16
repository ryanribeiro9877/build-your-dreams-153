// supabase/functions/_shared/ocr/registry.ts
//
// Seleção do extrator por `OCR_ENGINE` — ÚNICO `getExtractor` do repo
// (reconciliação Briefing 1 ↔ Briefing 2). Monta o extrator de produção a
// partir de SECRETS (nunca do código): credenciais AWS + região sa-east-1 para
// o OCR bruto; OCR_LLM_MODEL + chave OpenAI para o reforço.
//
// GATE (§5 do briefing): enquanto R-2/R-9 + DPA não fecharem, `OCR_ENABLED`
// permanece OFF em produção — nenhum RG/CPF real de cliente é processado.
// Este registry respeita esse gate: sem OCR_ENABLED="true", devolve null
// (OCR desligado), independentemente de OCR_ENGINE.
//
// ENGINES:
//   • "stub"          → extrator sintético (texto simulado), SEM credencial/
//                       região AWS — para exercitar o fluxo ponta-a-ponta.
//   • "textract"      → extrator híbrido real (Textract sa-east-1 + reforço
//                       OpenAI-direto), com os guards de segurança do B2.
//   • "openai-vision" → extrator por VISÃO (OpenAI direto): usa a chave OpenAI
//                       já existente no projeto, sem credencial AWS. A imagem
//                       trafega à OpenAI (só com o gate OCR_ENABLED aberto).
//   • desconhecido/ausente/none/off → null (OCR desligado), com log no caso
//                       de engine desconhecido.

import type { Extractor, LlmReinforcementFn } from "./types.ts";
import { createTextractExtractor } from "./textractExtractor.ts";
import { makeTextractRawOcr } from "./textractClient.ts";
import { assertOpenAiDirect, makeOpenAiReinforcement } from "./llmReinforcement.ts";
import { createOpenAiVisionExtractor } from "./openaiVisionExtractor.ts";
import { stubExtractor } from "./stubExtractor.ts";

/** Getter de secret trocável (env do edge ou tabela edge_runtime_secrets). */
export type SecretGetter = (key: string) => Promise<string | null> | string | null;

async function get(getSecret: SecretGetter, key: string): Promise<string | null> {
  const v = await getSecret(key);
  const s = (v ?? "").toString().trim();
  return s || null;
}

/**
 * Devolve o extrator selecionado por OCR_ENGINE, ou null se o OCR está
 * desligado (gate OFF, engine ausente/none, ou engine desconhecido — este
 * último com log). O engine "stub" não exige credencial AWS. Os guards de
 * segurança do "textract" (credenciais, região sa-east-1, OpenAI-direto)
 * continuam lançando — configuração inválida não é silenciada.
 */
export async function getExtractor(getSecret: SecretGetter): Promise<Extractor | null> {
  // Gate duro: OCR_ENABLED precisa ser "true" para processar qualquer coisa.
  const enabled = (await get(getSecret, "OCR_ENABLED")) === "true";
  if (!enabled) return null;

  const engine = ((await get(getSecret, "OCR_ENGINE")) ?? "").toLowerCase();
  if (!engine || engine === "none" || engine === "off") return null;

  if (engine === "stub") {
    // Stub: texto sintético, sem dependência externa (nem AWS). Só para teste.
    return stubExtractor;
  }

  if (engine === "openai-vision") {
    // Visão OpenAI DIRETO: usa a chave OpenAI do projeto, sem AWS. A imagem
    // trafega à OpenAI — só chega aqui com OCR_ENABLED aberto (gate acima).
    const openaiKey = await get(getSecret, "OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error(
        "OCR_ENGINE=openai-vision exige OPENAI_API_KEY (chave OpenAI) no secret.",
      );
    }
    const model = (await get(getSecret, "OCR_VISION_MODEL")) ?? "gpt-4o-mini";
    assertOpenAiDirect(model); // recusa modelo com "/" (OpenRouter)
    return createOpenAiVisionExtractor({ apiKey: openaiKey, model });
  }

  if (engine === "textract") {
    const accessKeyId = await get(getSecret, "AWS_ACCESS_KEY_ID");
    const secretAccessKey = await get(getSecret, "AWS_SECRET_ACCESS_KEY");
    const region = (await get(getSecret, "AWS_REGION")) ?? "sa-east-1";
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "OCR_ENGINE=textract exige AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY nos secrets do edge.",
      );
    }
    if (region !== "sa-east-1") {
      // Residência de dados em SP é requisito (§5). Não silenciar uma região errada.
      throw new Error(`AWS_REGION deve ser sa-east-1 para OCR (recebido: "${region}").`);
    }
    const sessionToken = (await get(getSecret, "AWS_SESSION_TOKEN")) ?? undefined;
    const rawOcr = makeTextractRawOcr({ accessKeyId, secretAccessKey, sessionToken, region });

    // Reforço LLM é opcional; só monta se houver modelo (OpenAI direto) + chave.
    const llmModel = await get(getSecret, "OCR_LLM_MODEL");
    const openaiKey = await get(getSecret, "OPENAI_API_KEY");
    let reinforce: LlmReinforcementFn | undefined;
    if (llmModel && openaiKey) {
      assertOpenAiDirect(llmModel); // recusa modelo com "/" (OpenRouter)
      reinforce = makeOpenAiReinforcement({ apiKey: openaiKey, model: llmModel });
    }
    return createTextractExtractor({ rawOcr, reinforce });
  }

  // Engine desconhecido: não quebra o fluxo (a flag só liga em teste). Loga e
  // devolve null — a Edge Function trata como OCR desligado (no-op).
  console.warn(`[ocr] OCR_ENGINE desconhecido: "${engine}". Suportado: "stub", "textract".`);
  return null;
}
