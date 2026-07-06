# Módulo OCR — extrator híbrido com confiança + atribuição

Extrator dedicado (Briefing 2) atrás da interface `Extractor` (Briefing 1). OCR
bruto de alta fidelidade + camada de mapeamento de campo (determinístico
primeiro, LLM só de reforço). **Cada campo carrega `confidence` e
`sourceDocument`** — valor incerto vira `[A PREENCHER]`/`[REVISAR]`, nunca é
afirmado como fato (anti-ALERTA-1).

## Arquivos

| Arquivo | Papel |
|---|---|
| `types.ts` | Contrato **único** do repo: `Extractor`, `OcrField`, `ExtractionResult`, `ExtractorInput`. |
| `deterministic.ts` | CPF (regex + **dígito verificador**), data/RG/CEP (regex). Confiança = legibilidade × certeza da regra. |
| `merge.ts` | Regra anti-ALERTA-1: dois documentos divergentes no mesmo campo → emite ambos com atribuição + `[REVISAR]`, sem escolher. |
| `textractExtractor.ts` | Orquestra OCR bruto → mapeamento → reforço. `engine = "textract+map"`. |
| `textractClient.ts` | OCR bruto default: AWS Textract `DetectDocumentText`, região **sa-east-1** (SigV4, sem SDK). Trocável. |
| `llmReinforcement.ts` | Passe de reforço: **OpenAI DIRETO** (nunca OpenRouter). Envia o texto, nunca a imagem. |
| `stubExtractor.ts` | Extrator sintético (texto simulado), **sem AWS**. Só para exercitar o fluxo em teste (`OCR_ENGINE=stub`). |
| `registry.ts` | `getExtractor()` — **único seletor do repo**; escolhe por `OCR_ENGINE` (`stub`/`textract`), respeita o gate `OCR_ENABLED`. |

## Configuração (secrets do edge — nunca no código/git)

- `OCR_ENABLED` — gate mestre. **OFF** em produção até o gate §5 fechar. Sem `="true"`, `getExtractor()` devolve `null` (no-op).
- `OCR_ENGINE` — seleciona o extrator:
  - `stub` → extrator sintético, **sem** credencial/região AWS (teste local do fluxo).
  - `textract` → extrator real (exige os secrets AWS abaixo).
  - ausente/`none`/desconhecido → `null` (OCR desligado; desconhecido também loga).
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=sa-east-1` (obrigatório sa-east-1) — só para `textract`.
- `OCR_LLM_MODEL` — modelo **sem barra** (OpenAI direto) para o reforço; opcional.
- `OPENAI_API_KEY` — chave do reforço; opcional.

## GATE DURO — NÃO ligar em dado real antes disto (§5 do briefing)

`OCR_ENABLED` permanece OFF até, obrigatoriamente:

- [ ] **R-2** resolvido (CPF/RG/bancários/PIX param de trafegar em texto plano).
- [ ] **R-9** resolvido (policy do bucket `chat-attachments` escopada ao dono).
- [ ] **DPA** assinado (AWS + OpenAI) + retenção configurada.
- [ ] Região `sa-east-1` confirmada.

Enquanto o gate não fecha: desenvolver/testar **só com documentos sintéticos**
(RG fictício). Nenhum RG/CPF real de cliente.

## Uso

A Edge Function `ocr-attachment` consome daqui (secrets via `Deno.env`):

```ts
import { getExtractor } from "../_shared/ocr/index.ts";

// SecretGetter: env do edge (ou getRuntimeSecret(admin, k), ambos válidos).
const extractor = await getExtractor((k) => Deno.env.get(k) ?? null);
if (extractor) {
  const result = await extractor.extract(
    { bytes, mimeType, sourceDocument: "RG_autora" },
    { enableLlmReinforcement: true },
  );
  // result.fields: cada um com confidence + sourceDocument + needsReview
}
```

Para consolidar múltiplos documentos (anti-ALERTA-1), passe os resultados por
`mergeExtractionResults([...])`.
