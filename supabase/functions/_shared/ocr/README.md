# Módulo OCR — extrator híbrido com confiança + atribuição

Extrator dedicado (Briefing 2) atrás da interface `Extractor` (Briefing 1). OCR
bruto de alta fidelidade + camada de mapeamento de campo (determinístico
primeiro, LLM só de reforço). **Cada campo carrega `confidence` e
`sourceDocument`** — valor incerto vira `[A PREENCHER]`/`[REVISAR]`, nunca é
afirmado como fato (anti-ALERTA-1).

## Arquivos

| Arquivo | Papel |
|---|---|
| `types.ts` | Contrato: `Extractor`, `OcrField`, `ExtractionResult`. |
| `deterministic.ts` | CPF (regex + **dígito verificador**), data/RG/CEP (regex). Confiança = legibilidade × certeza da regra. |
| `merge.ts` | Regra anti-ALERTA-1: dois documentos divergentes no mesmo campo → emite ambos com atribuição + `[REVISAR]`, sem escolher. |
| `textractExtractor.ts` | Orquestra OCR bruto → mapeamento → reforço. `engine = "textract+map"`. |
| `textractClient.ts` | OCR bruto default: AWS Textract `DetectDocumentText`, região **sa-east-1** (SigV4, sem SDK). Trocável. |
| `llmReinforcement.ts` | Passe de reforço: **OpenAI DIRETO** (nunca OpenRouter). Envia o texto, nunca a imagem. |
| `registry.ts` | `getExtractor()` — seleciona por `OCR_ENGINE`, respeita o gate `OCR_ENABLED`. |

## Configuração (secrets do edge — nunca no código/git)

- `OCR_ENABLED` — gate mestre. **OFF** em produção até o gate §5 fechar.
- `OCR_ENGINE=textract` — seleciona o extrator.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=sa-east-1` (obrigatório sa-east-1).
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

```ts
import { getExtractor } from "../_shared/ocr/index.ts";
import { getRuntimeSecret } from "../_shared/runtimeSecrets.ts";

const extractor = await getExtractor((k) => getRuntimeSecret(admin, k));
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
