# Dossiê de Investigação — Card `[INT] OCR (início)`

> **Tipo:** investigação / recon **READ-ONLY** sobre o repositório `build-your-dreams-153`.
> **Contexto:** Supabase fora do ar (API/CLI/web) — **nenhum acesso ao banco vivo**. Toda resposta abaixo vem da **leitura do repositório** (código-fonte + `supabase/migrations/*.sql` + Edge Functions). Onde a resposta só existiria em runtime, isso é dito explicitamente.
> **Data:** 2026-07-06 · **Branch:** `claude/ocr-integration-investigation-qi7qge`
> **Regra anti-alucinação:** o que não existe no código está marcado como `[NÃO ENCONTRADO]` — ausência é achado válido. Nenhum preço/acurácia de fornecedor externo foi pesquisado (fora de escopo).

---

## Bloco A — O OCR já existe?

### [A1] — Existe qualquer OCR/extração de texto de imagem hoje?
**Resposta:** **Não.** Há extração de texto, mas só de **PDF/DOCX/TXT/MD** — nunca de imagem. Não existe `textract`, `document ai`, `vision`, `tesseract` nem qualquer chamada de OCR no repositório. Imagem cai no `return null`.

**Evidência:** `src/lib/extractFileText.ts` → `extractFileText`
```ts
if (mime === "text/plain" || mime === "text/markdown" ...) return sanitizeExtractedText(await file.text());
if (mime === "application/vnd.openxmlformats-...wordprocessingml.document") { /* mammoth */ }
if (mime === "application/pdf") { /* pdf.js */ }
return null;   // ← imagem (image/*) e qualquer outro tipo: sem extração
```
**Observação:** As únicas menções a "OCR" no código são comentários que declaram a lacuna ("OCR é fase 2", "que virá em breve"). `supports_vision` aparece só como metadado de catálogo de modelos (ver E1), nunca como chamada.

### [A2] — A coluna `extracted_text`: onde vive, tipo e quem a preenche
**Resposta:** Vive em **`public.chat_attachments`**, tipo **`text` nullable**. É preenchida em **um único ponto**: o insert do frontend na ingestão. Para imagem é **sempre `null`** (confirma a doc), pois `extractFileText` devolve `null` para `image/*`.

**Evidência (schema):** `supabase/migrations/20260612120000_v24_document_channels.sql` → `CREATE TABLE public.chat_attachments`
```sql
  extracted_text text,                 -- texto extraído na ingestão (nullable)
```
**Evidência (único write):** `src/lib/ingestChatAttachments.ts` → `ingestChatAttachments`
```ts
const safeText = sanitizeExtractedText(text);   // text = extractWithFallback(file) → null p/ imagem
...
await supabase.from("chat_attachments").insert({ ..., extracted_text: safeText });
```
**Observação:** O orquestrador **nunca** escreve `extracted_text` — só faz `UPDATE` de `summary`/`summary_generated_at` (`ensureCaseSummary` em `chat-orchestrator/index.ts`). Confirmado por busca: nenhum `.update({... extracted_text ...})` em todo o repo. Logo, o único caminho que popularia OCR seria alterar/complementar a ingestão ou criar um novo passo (ver E3).

### [A3] — O gancho do 2.7 (upload de imagem): o "ponto de pouso" já existe?
**Resposta:** **Parcialmente pronto.** A persistência existe: a imagem sobe ao bucket privado **`chat-attachments`** e vira uma linha em `chat_attachments` com `storage_path`. O que **falta** é qualquer código que **releia o binário** da imagem do Storage — hoje ninguém faz `download`/`createSignedUrl` desse bucket no fluxo de chat.

**Evidência (upload + storage_path):** `src/lib/ingestChatAttachments.ts` → `ingestChatAttachments`
```ts
const path = `${userId}/${sessionId}/${Date.now()}_${sanitizeName(file.name)}`;
await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false, contentType: file.type || undefined });
...
await supabase.from("chat_attachments").insert({ ..., storage_path: path, ... });
```
**Evidência (bucket):** `supabase/migrations/20260612120000_v24_document_channels.sql`
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 15728640) -- 15 MB
```
**Observação:** URLs assinadas (`.createSignedUrl(path, 3600)`) existem no projeto, mas **só para outros buckets** (`useAgentDocuments.tsx` → bucket de modelos; `useTaskAttachments.ts` → `task-attachments`). Para `chat-attachments` **`[NÃO ENCONTRADO]`** qualquer geração de signed URL / download. Ou seja: o dado da imagem entra no Storage e **nunca é lido de volta** — o OCR teria que introduzir esse read (via service-role `.download()` numa Edge Function é o caminho natural).

### [A4] — `loadCaseDocuments()` / `hasReadableDocs`: por que imagem não conta
**Resposta:** Porque `loadCaseDocuments` **filtra por `extracted_text` não-nulo** (duas vezes: no SQL e no `.filter` em memória). Como imagem tem `extracted_text = null`, ela nunca entra na lista. O filtro é por **presença de texto**, não por mime-type.

**Evidência:** `supabase/functions/chat-orchestrator/index.ts` → `loadCaseDocuments`
```ts
const { data } = await admin.from("chat_attachments")
  .select("id, file_name, extracted_text, summary, summary_generated_at")
  .eq("session_id", sessionId).eq("is_active", true)
  .not("extracted_text", "is", null)             // ← SQL: exclui imagem (null)
  ...
return (((data as ...[]) || [])
  .filter((d) => d.extracted_text && d.extracted_text.trim().length > 0)  // ← defensivo em memória
  .map(...));
```
`hasReadableDocs` é derivado direto disso, na entrada da orquestração:
```ts
const hasReadableDocs = (await loadCaseDocuments(admin, body.sessionId)).length > 0;
```
**Observação:** Consequência direta para o OCR — **basta popular `extracted_text` da imagem** para ela passar a contar como "insumo legível" automaticamente, sem tocar em `loadCaseDocuments`. Não há filtro de mime-type que a exclua depois (ver B1).

---

## Bloco B — Portas que reabrem quando o OCR entrar

### [B1] — Classificador de intenção (2.8) e o override determinístico
**Resposta:** **Sim — a imagem passa a contar como insumo automaticamente** quando o OCR preencher `extracted_text`, e **não há filtro de mime-type** que ainda a exclua. A decisão de insumo é 100% baseada em `hasReadableDocs`, que por sua vez é `loadCaseDocuments().length > 0` (só olha `extracted_text`).

**Evidência (uso + override determinístico):** `supabase/functions/chat-orchestrator/index.ts` (mode START)
```ts
const hasReadableDocs = (await loadCaseDocuments(admin, body.sessionId)).length > 0;
intentCategory = await classifyIntent(admin, INTENT_CLASSIFIER_MODEL, body.message, { hasReadableDocs });
// Assimetria B (determinística): documento legível = insumo → NUNCA bloqueia a geração,
// mesmo que o modelo tenha dito SEM_INSUMO.
if (intentCategory === "NEGOCIO_SEM_INSUMO" && hasReadableDocs) intentCategory = "NEGOCIO_COM_INSUMO";
```
**Evidência (o classificador é instruído "imagens não contam" — texto que ficará obsoleto):** `chat-orchestrator/intentClassifier.ts` → `INTENT_CLASSIFIER_RULES`
```
Anexos de IMAGEM não contam como insumo (não são lidos até o OCR).
```
**Observação:** Hoje o override só dispara para PDF/DOCX/TXT. Com OCR, uma imagem com texto extraído entra em `loadCaseDocuments` → `hasReadableDocs=true` → o override força `COM_INSUMO` para ela também. **Ponto de manutenção:** o prompt do classificador (`INTENT_CLASSIFIER_RULES`) e o `docsNote` em `classifyIntent` ainda dizem "imagens não são lidas até o OCR" — passarão a mentir e precisam ser revistos, embora o override determinístico já corrija o comportamento independentemente do texto do prompt.

### [B2] — O "blocking gate" de anexos e a exceção da imagem (Opção 2)
**Resposta:** O gate vive no **frontend** (`JurisCloudOS.handleSend`). Ele **bloqueia** a geração quando um anexo textual falha (upload ou extração). A exceção da imagem é **condicionada a mime-type/extensão de imagem** (`isImageAttachment`), roteando imagens para um balde separado (`imagesWithoutText`) que **não** entra no gate — só gera um aviso amigável. **Quando o OCR preencher o texto, a imagem sai da exceção automaticamente** e cai na regra geral (texto extraído = usado; sem texto = trata como falha), porque a classificação imagem→`imagesWithoutText` só acontece **quando não há texto extraível**.

**Evidência (classificação por mime-type/extensão):** `src/lib/ingestChatAttachments.ts` → `isImageAttachment` + branch de resultado
```ts
function isImageAttachment(file: File): boolean {
  if ((file.type || "").toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(file.name);
}
...
if (!safeText) {                                    // ← só entra aqui se NÃO houve texto
  if (isImageAttachment(file)) result.imagesWithoutText.push(file.name);  // imagem: só avisa
  else result.failedExtraction.push(file.name);                          // doc textual: bloqueia
}
```
**Evidência (o gate no front):** `src/components/JurisCloudOS.tsx` → `handleSend`
```ts
if (ing.imagesWithoutText.length > 0) { /* aviso 🖼️ "Ainda não consigo extrair o texto... virá com o OCR" — NÃO bloqueia */ }
// GATE (documentos textuais apenas): só bloqueia por upload falho ou por documento textual sem texto legível.
const failedAll = [...ing.failedUpload, ...ing.failedExtraction];
if (failedAll.length > 0) { await refundTokens(...); /* 🚫 Geração bloqueada */ }
```
**Observação — comportamento pós-OCR:** Com OCR gerando `safeText` para a imagem, `!safeText` é `false` → a imagem **nunca** é adicionada a `imagesWithoutText` (a exceção deixa de mascarar) e sobe com `extracted_text` preenchido — vira insumo normal. **Mas atenção ao caso de borda:** se o OCR **falhar/retornar vazio** para uma imagem, ela voltaria a `imagesWithoutText` (continua sem bloquear) — o que provavelmente é o comportamento desejado, mas depende de onde o OCR roda (no cliente, dentro de `ingestChatAttachments`, ou assíncrono no servidor — ver E3). Se o OCR for assíncrono no servidor, a decisão do gate acontece **antes** do OCR existir, então a imagem seguiria como `imagesWithoutText` no momento do envio e só viraria insumo em mensagens seguintes.

### [B3] — Lista concreta de reteste quando o OCR entrar
Não é regressão; é **consequência** de a imagem passar a ter texto. Pontos que hoje estão "fechados" e precisarão de reteste:

| # | Ponto (arquivo → símbolo) | Por que reabre |
|---|---|---|
| 1 | `src/lib/ingestChatAttachments.ts` → `isImageAttachment` / branch `imagesWithoutText` (**2.7**) | Imagem com OCR deixa de ir para `imagesWithoutText`; retestar upload de imagem com/sem texto extraído. |
| 2 | `chat-orchestrator/index.ts` → `loadCaseDocuments` (**Canal A**) | Imagem passa a entrar na lista de documentos do caso; retestar injeção no N3 e `ensureCaseSummary` sobre texto de OCR. |
| 3 | `chat-orchestrator/index.ts` mode START → `hasReadableDocs` + override `SEM_INSUMO→COM_INSUMO` (**2.8**) | Imagem passa a contar como insumo; retestar detecção de insumo com só-imagem anexada. |
| 4 | `chat-orchestrator/intentClassifier.ts` → `INTENT_CLASSIFIER_RULES` / `NEED_INFO_OCR_NOTE` e `classifyIntent`→`docsNote` | Textos "imagens não são lidas até o OCR" ficam obsoletos; revisar prompts. |
| 5 | `src/components/JurisCloudOS.tsx` → `handleSend` (gate + aviso 🖼️) | Mudança na semântica do aviso de imagem e do gate; retestar mensagem ao usuário. |

---

## Bloco C — Escrita no cadastro (`clients`) e o Resolvedor de cliente

### [C1] — A tabela `clients`: nº de colunas e dados sensíveis
**Resposta:** **49 colunas** (16 no CREATE original + 33 na V15) — confirma "~50". A afirmação "telas exibem ~10" é **parcialmente refutada**: `ClientDetails.tsx` exibe poucos campos (modo leitura), mas o formulário de `Clients.tsx` liga **~45 campos**.

**Evidência (16 base):** `supabase/migrations/20260412205421_b989c9c4-...sql` → `CREATE TABLE public.clients`
```sql
id, full_name, cpf, rg, email, phone, address, city, state, zip_code,
notes, status, responsible_lawyer_id, created_by, created_at, updated_at
```
**Evidência (+33 V15):** `supabase/migrations/20260529160000_clients_projuris_schema.sql` → `ALTER TABLE ... ADD COLUMN`
```sql
cnpj, ie, im, legal_rep_cpf, rg_issuer, rg_uf, mother_name, father_name, pis_nit,
bank_name, bank_agency, bank_account, bank_account_type, pix_key, pix_key_type, ...
```
**Colunas sensíveis (todas `text`, salvo `birth_date`/`foundation_date` = `date`):**
- Documentos: `cpf`, `rg`, `rg_issuer`, `rg_uf`, `cnpj`, `ie`, `im`, `legal_rep_cpf`, `pis_nit`
- Bancários/PIX: `bank_name`, `bank_agency`, `bank_account`, `bank_account_type`, `pix_key`, `pix_key_type`
- Filiação/pessoais: `mother_name`, `father_name`, `birth_date`, `gender`, `marital_status`, `nationality`, `natural_city`, `natural_uf`
- Endereço: `address`, `zip_code`, `city`, `state`, `neighborhood`, `address_number`, `address_complement`, `country`
- Contatos: `email`, `phone`, `phone_commercial`, `phone_home`

**Observação:** O form de `Clients.tsx` referencia `form.gov_br_profile`, que **`[NÃO ENCONTRADO]`** em qualquer migration — provável campo de UI sem coluna no banco. Estes são exatamente os campos que o OCR passaria a escrever (ver relevância em D1).

### [C2] — Existe escrita em `clients` hoje?
**Resposta:** **Parcial.** A doc está **confirmada quanto ao `.update()`**: não existe nenhum `.update()` em `clients` no repo. Porém **existe `.insert()`** em três pontos — logo há caminho de **criar**, mas **nenhum de atualizar** um cadastro existente.

**Evidência (INSERT front):** `src/pages/Clients.tsx`
```ts
const { data: inserted, error } = await supabase.from("clients").insert(payload as any).select("id").single();
```
`src/pages/ImportarDados.tsx` → `supabase.from("clients").insert(payload as never)`
**Evidência (INSERT edge / tool do agente):** `supabase/functions/chat-orchestrator/tools/handlers.ts` → `runWriteTool`, case `cadastrar_cliente`
```ts
const payload = { created_by: userId, full_name: args.full_name, status: "ativo" };
for (const k of ["cpf","cnpj","tipo_pessoa","email","phone"]) if (args[k]) payload[k] = args[k];
const { data, error } = await userClient.from("clients").insert(payload).select("id, full_name").single();
```
**Observação:** Para o OCR "preencher o cadastro" de um cliente **existente**, um `.update()` teria que ser **construído do zero**. A tool `cadastrar_cliente` só faz INSERT, aceita apenas 6 campos (`full_name, cpf, cnpj, tipo_pessoa, email, phone`) — **não** cobre RG, bancários, PIX, endereço detalhado — e usa `userClient` (JWT do usuário), não service_role.

### [C3] — RLS de `clients`
**Resposta:** RLS habilitado com 4 comandos. **SELECT/INSERT liberais**; **UPDATE/DELETE restritos por papel** (RBAC via `has_role`). Nenhuma policy menciona `service_role` (que por padrão bypassa RLS).

**Evidência (endurecimento):** `supabase/migrations/20260412205436_478ee3f6-...sql`
```sql
CREATE POLICY "Role-based update clients" ON public.clients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lawyer')
      OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'manager'));
```
**Estado final:**
| Comando | Role | USING / WITH CHECK |
|---|---|---|
| SELECT | authenticated | `USING (true)` |
| INSERT | authenticated | `WITH CHECK (auth.uid() = created_by)` |
| UPDATE | authenticated | `USING (admin OR lawyer OR director OR manager)` |
| DELETE | authenticated | `USING (admin OR lawyer OR director)` |

**Observação:** Um pipeline OCR em Edge Function pode: (a) usar `userClient` (JWT) — UPDATE só passa se o usuário tiver papel admin/lawyer/director/manager; ou (b) usar o client `admin` (service_role), que **bypassa toda a RLS**. O código já mantém `admin` disponível para leituras (ex.: `consultar_cliente`). Escrever via service_role é tecnicamente possível, mas **contornaria o RBAC** — é decisão de segurança, não bloqueio técnico.

### [C4] — Resolvedor de cliente e vínculo anexo→cliente
**Resposta:** **Não existe** resolvedor/desambiguador nem vínculo anexo→cliente. "Salvar a imagem no cliente" está **BLOQUEADO por dependência ausente**: `chat_attachments` **não tem `client_id`** (nenhuma FK para `clients`) e não há componente que resolva a qual cliente um documento/frase se refere.

**Evidência (sem `client_id`):** `supabase/migrations/20260612120000_v24_document_channels.sql` → `CREATE TABLE public.chat_attachments` — só `session_id` (FK) e `user_id`; **nenhuma** referência a `clients`.
**Evidência (o que existe é só BUSCA textual, não resolver):** `chat-orchestrator/tools/handlers.ts` → `runReadTool`, case `consultar_cliente`
```ts
const { data } = await admin.from("clients").select("id, full_name, cpf, status")
  .or(`full_name.ilike.%${q}%,cpf.ilike.%${q}%`).limit(10);
```
Retorna até 10 candidatos como ferramenta ao modelo — **não** desambigua nem grava `client_id`. Nenhum símbolo "resolver"/"resolvedor" no código.

**Observação — delimitação do card OCR:**
- **Fecha sozinho (OCR):** extrair texto de imagem (RG/comprovante), estruturar campos e sinalizar incerteza. Basta preencher `chat_attachments.extracted_text` (coluna já existe) para a imagem virar insumo do chat.
- **Fica pendurado (anexar ao cadastro):** exige duas peças inexistentes — (1) **vínculo anexo→cliente** (`chat_attachments` precisaria de `client_id`, ou usar `client_documents.client_id`, que existe mas não é alimentado por OCR) e (2) um **client-resolver** que decida o `client_id` quando nome/CPF é ambíguo. E, mesmo resolvido o cliente, gravar os campos exigiria o `.update()` em `clients` que **não existe** (C2). Esta é a mesma dependência que travou parte de 2.4/2.7.

---

## Bloco D — Segurança / LGPD (R-2, R-9) e exposição a terceiros

### [D1] — R-2: dados sensíveis em texto plano
**Resposta:** **Confirmado.** Todas as colunas de CPF/RG/bancários/PIX em `clients` são `text` puro — **sem** `pgcrypto`/`vault`/`crypt()`/máscara. As telas usam `select("*")`, trazendo o registro inteiro ao cliente.

**Evidência (tipos):** `20260412205421_b989c9c4-...sql` (`cpf TEXT, rg TEXT`) + `20260529160000_clients_projuris_schema.sql` (`bank_account text`, `pix_key text`, `legal_rep_cpf text`).
**Evidência (select-star):** `src/pages/Clients.tsx` → `loadClients`
```ts
const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
```
`src/pages/ClientDetails.tsx` → `supabase.from("clients").select("*").eq("id", clientId).single()`
**Observação (diagnóstico, sem propor correção):** PII sensível persistida em texto plano, sem cripto de coluna nem mascaramento; `select("*")` não projeta colunas. A proteção depende exclusivamente das RLS de `clients`. Nenhuma extensão de cripto é habilitada. **Relevância OCR:** o pipeline passaria a **escrever exatamente esse dado** (CPF/RG/banco) com mais volume/frequência — R-2 é o estado-base antes de ligar isso.

### [D2] — R-9: policy do bucket de storage
**Resposta:** **Ampla (não escopada ao dono).** A policy de SELECT do bucket `chat-attachments` exige apenas `auth.uid() IS NOT NULL` — não checa `owner = auth.uid()` nem prefixo de path por usuário. Qualquer usuário autenticado que conheça o path lê (e pela policy de DELETE, apaga) o anexo de outro.

**Evidência:** `supabase/migrations/20260612120000_v24_document_channels.sql`
```sql
-- Mesmo padrão dos demais buckets do projeto (qualquer usuário autenticado).
CREATE POLICY "chat_attach_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "chat_attach_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "chat_attach_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
```
**Observação:** IDOR / vazamento horizontal — bucket `chat-attachments` (privado, 15 MB). O próprio comentário admite ser "o mesmo padrão dos demais buckets", sugerindo o problema replicado. **Relevância OCR:** com OCR, esse bucket passa a concentrar RG/CPF escaneados de clientes → R-9 fica mais grave. (Nota: a tabela `chat_attachments` **tem** RLS escopada ao dono da sessão; a falha é na policy de `storage.objects`, o binário.)

### [D3] — Exposição a provedor terceiro (se a abordagem for modelo de visão)
**Resposta:** **Parcial + achado LGPD.** O provider é derivado do formato do `model_id`: **com `/` → OpenRouter; sem `/` → OpenAI**. Se o OCR usasse visão, a imagem do RG/CPF iria para **OpenAI** (modelo sem barra) e/ou **OpenRouter** (modelo com barra, que reencaminha a sub-provedores como Anthropic/Google). **`[NÃO ENCONTRADO]`** qualquer configuração de retenção-zero / no-log / DPA / `data_policy` junto a esses provedores.

**Evidência (derivação):** `chat-orchestrator/index.ts` → `providerFromModel`
```ts
function providerFromModel(model: string | null | undefined): ProviderCode {
  return (model || "").includes("/") ? "openrouter" : "openai";
}
```
Endpoints: `https://api.openai.com/v1/chat/completions` e `https://openrouter.ai/api/v1/chat/completions`.
**Evidência (headers OpenRouter — só identificação, não privacidade):**
```ts
headers["HTTP-Referer"] = "https://build-your-dreams-153.vercel.app";
headers["X-Title"] = "JurisAI";
```
**Observação (achado LGPD, não falha de busca):** Não há no código nenhum mecanismo de zero-retention/no-log negociado, nem parâmetro `data_policy` na chamada. As únicas ocorrências de "DPA" são copy de marketing (`src/pages/landing/data.ts`) e notas de `docs/` ("revisar antes do cutover"). Se o OCR de visão for construído sobre a `callLLM` existente, documentos de identidade trafegariam para OpenAI/OpenRouter (e, via OpenRouter, a sub-provedores conforme o roteamento) sem controle de retenção declarado.

---

## Bloco E — Insumos para a decisão de abordagem

### [E1] — Providers e modelos configurados (com visão)
**Resposta:** **5 providers no enum** (`anthropic`, `openai`, `google`, `openrouter`, `deepseek`); o catálogo semeado nas migrations cobre **2** — OpenAI (~31 modelos) e Anthropic (6) ≈ 37 estáticos; OpenRouter é populado dinamicamente. **Modelos com visão hoje:** os 6 Anthropic têm `supports_vision=true`; os 31 OpenAI foram inseridos **sem** a coluna `supports_vision` (default `false`), inclusive `gpt-4o`. O catálogo vive em **`model_pricing`** (não `llm_provider_configs`, que guarda as chaves BYOK por usuário).

**Evidência (enum + coluna):** `supabase/migrations/20260524120000_onda2_chat_orchestrator.sql`
```sql
CREATE TYPE public.provider_code AS ENUM ('anthropic','openai','google','openrouter','deepseek');
...
supports_vision boolean NOT NULL DEFAULT false,
```
**Evidência (Anthropic com visão):** mesma migration
```sql
('anthropic','claude-opus-4-7', ..., true, true, true),   -- (..., supports_tools, supports_vision, is_active)
```
**Evidência (OpenAI sem a flag):** `supabase/migrations/20260525000000_openai_models_catalog_and_ceo_prompt.sql`
```sql
INSERT INTO public.model_pricing (provider, model_id, ..., supports_tools, is_active) VALUES
  ('openai','gpt-4o','GPT-4o · multimodal', ..., true, true),   -- supports_vision omitido → default false
```
**Evidência (OpenRouter deriva visão por modalidade):** `supabase/functions/sync-openrouter-models/index.ts`
```ts
supports_vision: inputMods.includes("image"),
```
**Observação:** A capacidade de **escolher** um modelo com visão já existe no dado (todos os Claude; via OpenRouter, qualquer `input_modalities: image`). O que falta é o **caminho de código que envia a imagem** (ver E2). Ponto de atenção: os `gpt-4o*` estão `supports_vision=false` por omissão — um seed precisaria corrigir se a UI filtrar por essa flag.

### [E2] — Já se usa visão em algum lugar?
**Resposta:** **Não.** Todo conteúdo enviado ao LLM é montado como **texto (string)**. Não há `image_url`, `data:image` nem content array multimodal (`type:"image"`) em nenhum ponto. Enviar imagem ao modelo seria **inteiramente novo**.

**Evidência:** `chat-orchestrator/index.ts` → `callOpenAICompatible`
```ts
const m: Record<string, unknown> = { role: h.role, content: h.content ?? "" };
...
if (opts.userMessage) messages.push({ role: "user", content: opts.userMessage });
```
`content` é sempre string. O único content-como-array é o **cache de texto Anthropic** (`{ type: "text", ..., cache_control }`), nunca `type:"image"`. A grep de `createSignedUrl|getPublicUrl|.download(` no orchestrator retornou **zero** — a Edge Function **nunca busca o binário** do anexo no Storage.
**Observação:** Implementar OCR/visão exige (a) um novo caminho que leia o binário do Storage e (b) popular `extracted_text` **ou** montar um content array multimodal — nenhum dos dois existe hoje.

### [E3] — Ponto de inserção do pipeline (proposta, não decisão)
**Resposta:** A máquina de estados é uma **cadeia de reinvocações da própria Edge Function** `chat-orchestrator` (`routing_n1 → routing_n2 → executing_n3 → validating_n2 → validating_n1 → done`), disparada por `fireNextStep`. Anexos são lidos por `loadCaseDocuments` (exige `extracted_text` não-nulo), consumidos no `executing_n3` e `validating_n2`. Há candidatos claros de inserção.

**Evidência (cadeia):** `chat-orchestrator/index.ts` (comentário de topo)
```ts
// Cadeia: routing_n1 -> routing_n2 -> executing_n3 -> validating_n2 -> validating_n1 -> done
```
**Evidência (disparo assíncrono):** modo START faz `insert({status:"routing_n1"})` + `fireNextStep(runId, ...)`; modo STEP roda `processStep` em `EdgeRuntime.waitUntil(...)`.

**Proposta fundamentada (recomendação — decisão é do Ryan):**

1. **Preferido — passo/Edge Function de OCR que popula `chat_attachments.extracted_text` (assíncrono).** Uma função `ocr-attachment` que lê `storage_path` via service-role `.download()`, roda OCR/visão e grava `extracted_text`. A partir daí **nada mais muda**: `loadCaseDocuments` passa a incluir a imagem e `ensureCaseSummary` já a resume. Menor blast-radius, encaixa no padrão de resumo assíncrono existente, não toca a montagem de mensagens do LLM. O comentário em `index.ts` já documenta a lacuna ("imagens (sem OCR) têm extracted_text nulo e ficam de fora de loadCaseDocuments"). Esqueleto reutilizável: `supabase/functions/sync-openrouter-models/index.ts` (padrão `serve → cors → auth → adminClient service-role → jsonResp`).
2. **Alternativo — visão nativa no `executing_n3`.** Montar content array multimodal em `callOpenAICompatible` + selecionar modelo `supports_vision`. Exige reescrever a montagem de mensagens (hoje 100% string), baixar o binário na função e lidar com custo/contexto por imagem. **Blast-radius alto.**
3. **Trigger no upload (2.7).** OCR disparado logo após o insert em `ingestChatAttachments` (ou por trigger de Storage). OCR pesado no browser é impraticável; um meio-termo é uma Edge Function acionada pós-insert, ainda alimentando o mesmo `extracted_text` do candidato 1.

**Observação:** Se o OCR for **assíncrono** (candidatos 1/3), atenção à interação com o gate/insumo (B2): a decisão de insumo acontece no envio da mensagem; a imagem só viraria insumo depois de o OCR concluir. Um OCR **síncrono na ingestão** evita isso, mas concentra latência no envio.

---

## 1. Resumo executivo

1. **O OCR já existe?** **Não.** A extração de texto cobre só PDF/DOCX/TXT/MD (`extractFileText`); imagem retorna `null`. Não há Textract/Document AI/Vision/Tesseract nem qualquer envio de imagem a LLM no repo.
2. **O que já está pronto para recebê-lo:** o "ponto de pouso" do dado — bucket privado `chat-attachments`, tabela `chat_attachments` com `storage_path` e a coluna `extracted_text` (nullable) já criada; e a coluna `supports_vision` + modelos de visão no catálogo `model_pricing`.
3. **O caminho de ativação é curto para o CHAT:** basta popular `extracted_text` da imagem → ela entra automaticamente em `loadCaseDocuments`, vira `hasReadableDocs` e é resumida por `ensureCaseSummary`. Sem filtro de mime-type bloqueando.
4. **O que falta tecnicamente:** ninguém relê o binário do Storage no fluxo de chat (`[NÃO ENCONTRADO]` signed URL/download para `chat-attachments`); a montagem de mensagens do LLM é 100% texto (visão seria nova).
5. **O que o OCR reabre para reteste** (consequência, não regressão): 2.7 (`isImageAttachment`/`imagesWithoutText`), Canal A (`loadCaseDocuments`), 2.8 (`hasReadableDocs` + override), prompts do classificador, e o gate no `handleSend` (ver B3).
6. **Escopo que o card fecha sozinho:** extrair → estruturar → sinalizar incerteza, entregando o texto ao chat via `extracted_text`.
7. **Escopo que fica pendurado:** "anexar ao cadastro do cliente" — depende de peças inexistentes (client-resolver, vínculo `chat_attachments→clients`, e um `.update()` em `clients`).
8. **Riscos LGPD pré-existentes** que o OCR agrava: R-2 (PII em texto plano), R-9 (policy de bucket ampla), e exposição a terceiro sem retenção-zero declarada.

## 2. Dependências e bloqueadores

| Item | Estado real (evidência) |
|---|---|
| **Resolvedor de cliente (C4)** | **Inexistente.** Só há busca textual `consultar_cliente` (ilike, top-10); nenhum símbolo resolver; `chat_attachments` sem `client_id`. → Bloqueia "salvar no cliente". |
| **Escrita em `clients` (C2/C3)** | `.update()` **não existe** (confirmado); há `.insert()` (front + tool `cadastrar_cliente`, 6 campos, via `userClient`). UPDATE exigiria construção do zero + papel admin/lawyer/director/manager (ou service_role bypassando RBAC). |
| **R-2 (D1)** | **Aberto.** CPF/RG/banco/PIX em `text` puro, sem cripto/máscara; telas com `select("*")`. |
| **R-9 (D2)** | **Aberto.** Policy do bucket `chat-attachments` ampla (`auth.uid() IS NOT NULL`), sem checagem de dono/path — IDOR horizontal. |
| **Exposição a terceiro (D3)** | Visão iria a OpenAI/OpenRouter conforme `model_id`; **`[NÃO ENCONTRADO]`** config de retenção-zero/no-log/DPA técnica. |

## 3. Perguntas que só o banco vivo responde

Ficaram pendentes pelo Supabase fora do ar; retomar quando voltar:
- **Contagem real** de linhas em `chat_attachments` com `extracted_text IS NULL` e `mime_type LIKE 'image/%'` (quantas imagens já subiram "cegas").
- **Contagem real** de colunas efetivas de `clients` no schema vivo (o dossiê contou 49 pelas migrations; confirmar que nenhuma migration fora deste repo alterou a tabela, e se `gov_br_profile` existe ou não no banco).
- **Catálogo `model_pricing` em runtime:** quantos modelos ativos por provider e quais realmente têm `supports_vision=true` (as migrations sugerem gpt-4o=false por omissão — confirmar o estado atual, incl. linhas do OpenRouter sincronizadas).
- **Providers com chave configurada** em `llm_provider_configs` (BYOK) — quais estão de fato utilizáveis para visão hoje.
- **Policies vivas** em `storage.objects` e `clients` (confirmar que nenhuma migration posterior/ação manual alterou o que está nas migrations).
- **Existência real da coluna `client_id`** (ou tabela de vínculo) que uma migration futura possa ter adicionado fora do que foi lido aqui.
