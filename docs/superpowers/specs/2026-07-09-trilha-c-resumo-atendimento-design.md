# TRILHA C · Ciclo 2 — Resumo do atendimento via LLM (card 6.2)

**Data:** 2026-07-09 · **Branch:** `claude/trilha-c-audio-atendimento` (worktree `wt-trilha-c`)

## 1. Objetivo
Gerar um **resumo estruturado via LLM** do atendimento (problemas, bancos, contratos, empréstimos, tarifas, ações possíveis, documentos solicitados, pendências, orientações, próximos passos) e **salvá-lo no cliente**, visível na ficha e no Histórico. Insumo para revisão humana — anti-alucinação (dado ausente → `"não informado"`, nunca inventado).

## 2. Descobertas que moldam o design (exploração)
- **COOP-DOCS é determinístico (não-LLM).** O padrão real "gerar via LLM + salvar" é o `ensureCaseSummary` no edge (`chat-orchestrator/index.ts`): server-side, `callLLM` (gpt-4o-mini, `temperature:0`, `jsonMode`), salva numa coluna. **Toda chamada de LLM é server-side (edge)** — nunca client-side.
- **Sem transcrição de áudio** (seam do Ciclo 1 não implementado). A única entrada textual do atendimento hoje é o **conteúdo do chat** da(s) sessão(ões) do cliente (`chat_messages` via `chat_sessions.client_id`), + eventualmente `chat_attachments.summary`. Áudio gravado (6.1) **não tem texto** ainda.
- **`client_timeline` é RPC derivada read-only** que já faz UNION sobre `client_documents` → salvar o resumo como linha `client_documents` faz ele **aparecer no Histórico de graça**. Não existe coluna de resumo em `clients`.

## 3. Decisões
| # | Decisão |
|---|---------|
| 1 | **Geração numa edge function NOVA e isolada** `attendance-summary` (não tocar no `chat-orchestrator` → não arrisca o chat de produção). Reusa `_shared/cors.ts` e o padrão de auth de `ocr-attachment`. |
| 2 | **Entrada = conteúdo de chat da sessão do cliente** (`chat_messages` das `chat_sessions` do cliente, limitado por chars) + `chat_attachments.summary` se houver. **Limitação documentada:** atendimentos só-áudio ficam sem insumo textual até a transcrição existir; o resumo então marca tudo `"não informado"`. |
| 3 | **Saída estruturada** (JSON) salva em `client_documents`: `document_type='resumo_atendimento'` (tipo NOVO, migration aditiva), `origem='sistema'`, `status='recebido'`, arquivo JSON em `client-documents/${clientId}/resumo_atendimento/${ts}.json`, `notes` = o JSON do resumo (exibição sem baixar), `document_name='Resumo do atendimento DD/MM/AAAA HH:MM'`. Aparece no Histórico via `client_timeline`. |
| 4 | **LLM:** `gpt-4o-mini`, `temperature:0`, `jsonMode`, `max_tokens ~1200`, chave resolvida server-side (`llm_provider_configs` + RPC `get_provider_key_decrypted`, igual ao `resolveKey` do orquestrador). Não-streaming. |
| 5 | **Anti-alucinação:** prompt manda "NÃO invente; se não estiver no texto, use 'não informado'"; `normalizeSummary` garante todos os campos presentes com default `"não informado"`. |
| 6 | **Kill-switch:** `ATTENDANCE_SUMMARY_ENABLED` (default ON — feature isolada e disparada só pelo usuário; `=== "false"` desliga). |
| 7 | **UI:** seção "Resumo do atendimento" na `ResumoTab` (`infoTabs.tsx`): botão **Gerar resumo** (invoca a edge), exibe o último resumo estruturado e lista os anteriores (`resumo_atendimento` do cliente). |

**Fora de escopo (YAGNI):** transcrição de áudio (outra track); coluna de cache em `clients`; edição do resumo; multi-idioma.

## 4. Arquivos
| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/<ts>_resumo_atendimento_doc_type.sql` | novo | `apply_migration` aditivo: `resumo_atendimento` no CHECK de `document_type` (introspectar vivo + adicionar, como no Ciclo 1). |
| `supabase/functions/attendance-summary/attendanceSummary.ts` | novo | Puro/testável (Deno): `SUMMARY_FIELDS`, `buildSummaryPrompt`, `assembleInput(messages, attachmentSummaries)`, `normalizeSummary(raw)` (default `"não informado"`), `buildSummaryDoc(...)`. |
| `supabase/functions/attendance-summary/attendanceSummary.test.ts` | novo | Deno test (roda no job `edge` do CI): assembleInput/normalizeSummary/buildSummaryPrompt. |
| `supabase/functions/attendance-summary/index.ts` | novo | `serve`: cors, auth (JWT), gather `chat_messages` (admin), `resolveKey`, chamada LLM mínima (fetch OpenAI-compat, jsonMode), normalize, upload JSON + insert `client_documents` (caller JWT → RLS). Respeita `ATTENDANCE_SUMMARY_ENABLED`. |
| `src/lib/attendanceSummaryClient.ts` | novo | Wrapper client-side: `invoke('attendance-summary', { clientId })` + tipos `AttendanceSummary`; `fetchAttendanceSummaries(clientId)` (lê `client_documents` `resumo_atendimento`, parse do `notes`). |
| `src/components/clients/tabs/infoTabs.tsx` | editar | `ResumoTab`: seção "Resumo do atendimento" — botão Gerar (loading/erro), exibição do resumo estruturado (campos, `"não informado"` quando vazio), lista dos anteriores. |
| `src/config/edgeFunctions` (se houver) / `supabase/config.toml` | editar se necessário | Registrar a função `attendance-summary` se o projeto exigir (verify_jwt etc.). |

## 5. Contrato da saída (JSON `AttendanceSummary`)
Campos (todos `string`, default `"não informado"`): `problemas, bancos, contratos, emprestimos, tarifas, acoes_possiveis, documentos_solicitados, pendencias, orientacoes, proximos_passos`. + `gerado_em` (ISO), `fonte` (ex.: `"chat"` / `"sem_conteudo"`).

## 6. Segurança
- Auth obrigatória (JWT). Leitura de `chat_messages`/sessões via **service-role** (para montar o insumo independentemente de quem criou a sessão). Insert em `client_documents` e upload no bucket via **caller JWT** (RLS `is_recepcao_or_socio` reusada; `uploaded_by`=caller). Chave do LLM só server-side (nunca ao client).

## 7. Testes & verificação
- **Deno (CI job `edge`):** `attendanceSummary.test.ts` — normalização (campos ausentes → "não informado"), assembleInput (limite de chars/ordem), prompt contém a instrução anti-alucinação. Sem Deno local → valida no CI.
- **Client (vitest):** `attendanceSummaryClient` parse do `notes`/normalização de exibição, se houver lógica pura.
- **Aceite manual (usuário):** numa ficha com sessão de chat, clicar "Gerar resumo" → ver o resumo estruturado → conferir a linha `resumo_atendimento` no banco e no Histórico.

## 8. Aceite
1. Prompt estruturado gera o resumo (campos do card).
2. Salvo no cliente (`client_documents` `resumo_atendimento`) e visível na ficha + Histórico.
3. Dado ausente → `"não informado"` (nunca inventado).
