# Relatório de Atualização da Cópia Local — 2026-07-07

Documento gerado ao sincronizar o diretório local com o código presente no GitHub
(`origin/main`). Lista tudo o que a `main` trouxe para a cópia local que antes estava
desatualizada.

## Contexto

| | |
|---|---|
| **Estado anterior (local)** | branch `claude/ocr-stub-pipeline-test-no49ca` @ `81fc8e9` |
| **Estado novo (GitHub)** | branch `main` @ `fef2623` |
| **Ponto de partida do diff** | `81fc8e9` (ancestral comum) |
| **Commits trazidos** | 19 (sem contar merges) |
| **Arquivos afetados** | 53 |
| **Volume** | +5.808 linhas / −1.318 linhas |
| **Novos (A)** | 35 · **Modificados (M)** | 15 · **Renomeados (R)** | 3 |

> Observação: o trabalho que só existia nesta máquina (classifier `ACAO_COM_TOOL`,
> edições WIP e docs) foi preservado antes da atualização, no commit de backup
> `af23bcf` da branch `claude/ocr-stub-pipeline-test-no49ca` (enviado ao GitHub).

---

## Commits trazidos do GitHub (mais recente → mais antigo)

| Hash | Data | Descrição |
|------|------|-----------|
| `36ef8f7` | 2026-07-07 | R-2 Fase 2C: escrita cifrada de clients + drop do texto puro (PII) |
| `b8a4afa` | 2026-07-07 | test(JurisCloudOS): stub supabase.rpc no mock para o efeito get_validation_count |
| `003a8ce` | 2026-07-07 | chore(migrations): reconciliar arquivos com o banco (fonte de verdade) + lint não-bloqueante no CI |
| `e5edb71` | 2026-07-07 | 3.7: gate documental + auto-liberação de pendências vinculadas |
| `9f33356` | 2026-07-07 | GOV-CRED-FE (3.4): aba Gov.br — cadastro + revelação auditada |
| `51726f6` | 2026-07-07 | COOP-DOCS-2/3: 4º template (contrato) + fluxo pós-confirmação (Modelo B) |
| `ef0e518` | 2026-07-07 | COOP-DOCS-3: mascara CPF no resumo do ActionCard (anti-shoulder-surfing) |
| `815084d` | 2026-07-07 | COOP-DOCS-2: 3 templates do cooperado com placeholders + mapa alinhado |
| `af84bd2` | 2026-07-07 | GOV-CRED (3.4): credenciais Gov.br — armazenamento cifrado + acesso auditado |
| `402b751` | 2026-07-07 | COOP-DOCS-3 §0: cadastrar_cliente trata CPF duplicado (23505) na via cifrada |
| `c19f2f9` | 2026-07-07 | COOP-DOCS-2: engine determinística de preenchimento dos documentos do cooperado |
| `7c50442` | 2026-07-07 | COOP-DOCS-1: tipos novos + conjunto obrigatório do cooperado |
| `b80d6ef` | 2026-07-07 | DOCS-HIST-LABEL: rótulo do tipo do documento no histórico (FE) |
| `c6345cb` | 2026-07-07 | 3.6: documentos do cliente — tipos (CHECK) + status + origem + log de auditoria |
| `d3364ce` | 2026-07-07 | 3.3: marcador de WhatsApp por telefone + PIX condicional obrigatório |
| `43cf1d4` | 2026-07-07 | feat(clientes): unicidade de CPF (índice cego) + aviso no cadastro |
| `402dd43` | 2026-07-07 | feat(clientes): nova identidade visual "neo-brutalista" no módulo (mockup 3.1) |
| `257047d` | 2026-07-06 | feat(clientes): telas separadas + shell de 16 abas no detalhe (layout 3.1) |
| `f264a98` | 2026-07-06 | AGT-CONSULTA: agente consulta cliente cadastrado (leitura via tool + role guard) |

---

## Arquivos por área

### 🆕 Módulo de Clientes (frontend)

Reformulação completa: telas separadas de cadastro/edição, detalhe com 16 abas e
nova identidade visual "neo-brutalista".

| Status | Arquivo |
|--------|---------|
| A | `src/components/clients/ClientForm.tsx` |
| A | `src/components/clients/shared.tsx` |
| A | `src/components/clients/tabs/chatTabs.tsx` |
| A | `src/components/clients/tabs/infoTabs.tsx` |
| A | `src/components/clients/tabs/relationalTabs.tsx` |
| A | `src/pages/ClientNew.tsx` |
| A | `src/pages/ClientEdit.tsx` |
| A | `src/styles/clientes.css` |
| M | `src/pages/ClientDetails.tsx` |
| M | `src/pages/Clients.tsx` |
| M | `src/index.css` |

### 🆕 Documentos do Cooperado (COOP-DOCS)

Engine determinística de preenchimento de `.docx`, tipos/conjuntos obrigatórios e
templates.

| Status | Arquivo |
|--------|---------|
| A | `src/lib/cooperadoDocs.ts` |
| A | `src/lib/cooperadoDocs.test.ts` |
| A | `src/lib/cooperadoOnboarding.ts` |
| A | `src/lib/generateCooperadoDocs.ts` |
| A | `src/lib/fillDocxTemplate.ts` |
| A | `src/lib/fillDocxTemplate.test.ts` |
| A | `src/components/chat/CooperadoChecklistCard.tsx` |
| A | `public/templates/contrato_honorarios_template.docx` |
| A | `public/templates/declaracao_hipossuficiencia_template.docx` |
| A | `public/templates/ficha_cadastral_cooperado_template.docx` |
| A | `public/templates/procuracao_template.docx` |

### 🔧 Chat / Orquestrador (Supabase Functions)

| Status | Arquivo |
|--------|---------|
| M | `supabase/functions/chat-orchestrator/index.ts` |
| M | `supabase/functions/chat-orchestrator/intentClassifier.ts` |
| M | `supabase/functions/chat-orchestrator/intentClassifier.test.ts` |
| M | `supabase/functions/chat-orchestrator/tools/handlers.ts` |
| M | `supabase/functions/chat-orchestrator/tools/registry.ts` |
| M | `src/components/chat/ActionCard.tsx` (máscara de CPF no resumo) |

### 🗄️ Migrations do banco (Supabase)

Novas migrations trazidas (aplicar/checar alinhamento com o banco):

| Status | Arquivo |
|--------|---------|
| A | `supabase/migrations/20260706200000_agt_consulta_role_recheck.sql` |
| A | `supabase/migrations/20260706220000_remove_leads_and_captacao_canais.sql` |
| A | `supabase/migrations/20260707125029_clients_status_dimensions.sql` |
| A | `supabase/migrations/20260707131211_cpf_bidx_unique.sql` |
| A | `supabase/migrations/20260707131354_client_phone_whatsapp_flags.sql` |
| A | `supabase/migrations/20260707134745_r9b_scope_client_documents_bucket.sql` |
| A | `supabase/migrations/20260707135855_client_documents_types_status_events.sql` |
| A | `supabase/migrations/20260707140000_r9c_scope_inter_assistant_and_agent_docs_buckets.sql` |
| A | `supabase/migrations/20260707152746_coop_docs_required_sets.sql` |
| A | `supabase/migrations/20260707160000_gov_cred_secure_storage.sql` |
| A | `supabase/migrations/20260707160000_r2_phase2c_save_client_rpc.sql` |
| A | `supabase/migrations/20260707170000_r2_phase2c_drop_plaintext_pii.sql` |
| A | `supabase/migrations/20260707174323_coop_docs_nao_cooperado_e_classificacao.sql` |
| A | `supabase/migrations/20260707181458_gate_documental_e_auto_liberacao.sql` |
| A | `supabase/migrations/20260707181832_gate_documental_fix_conjunto_por_cliente.sql` |
| A | `supabase/migrations/20260707182104_gate_documental_use_client_required_set.sql` |

Renomeadas (reconciliação de timestamps com o banco — conteúdo idêntico, `R100`):

| De | Para |
|----|------|
| `20260706130000_intent_classifier_fastpath.sql` | `20260706123832_intent_classifier_fastpath.sql` |
| `20260706150000_intent_classifier_insumo.sql` | `20260706131005_intent_classifier_insumo.sql` |
| `20260706200000_leads_registration.sql` | `20260706213833_leads_registration.sql` |

### 🔧 Outros

| Status | Arquivo |
|--------|---------|
| M | `src/App.tsx` (rotas das novas telas de cliente) |
| M | `src/integrations/supabase/types.ts` (tipos regenerados) |
| M | `src/pages/ImportarDados.tsx` |
| M | `src/components/__tests__/JurisCloudOS.responsive.test.tsx` |
| M | `.github/workflows/ci.yml` (lint não-bloqueante) |
| M | `AGENTS.md` |

---

## Ações recomendadas pós-atualização

1. **Banco de dados** — 16 migrations novas vieram no código. Verificar se o banco
   Supabase já está com elas aplicadas (a `main` reconciliou arquivos com o banco
   como fonte de verdade).
2. **`npm install`** — `package-lock.json` pode ter mudado; rodar para alinhar deps.
3. **Trabalho WIP** — as edições que estavam soltas (`Clients.tsx`, `ImportarDados.tsx`,
   `chat-orchestrator/index.ts`, `handlers.ts`) foram salvas na branch de backup e
   podem conflitar com a nova versão da `main`. Reaplicar seletivamente se ainda
   fizerem sentido.
