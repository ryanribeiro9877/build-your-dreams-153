# Chat Multimodal — áudio + documento→ação (design)

Data: 2026-07-23
Autor: Ryan + Claude Code (brainstorming)
Status: aprovado (design) — pronto para plano de implementação

## Objetivo

Tornar **toda ação do sistema** (criar pendência/tarefa, cadastrar cliente,
agendar, distribuir…) executável também por **áudio** e por **envio de
documento** no chat. Dois trilhos independentes, ambos desembocando no pipeline
de turno já existente do `chat-orchestrator`.

Decisões fechadas (Ryan):
- Transcrição = `whisper-1` (qualidade máxima), OpenAI DIRETO (PII).
- ActionCard obrigatório antes de qualquer cadastro originado de imagem.
- Mic no modo **gravar → revisar → enviar** (Whisper substitui o ditado Web
  Speech; usuário confere/edita o texto antes de enviar).
- Specar os dois trilhos juntos.

## Escolhas de arquitetura (com alternativas)

1. **Transcrição roda no CLIENTE**, espelhando o OCR de imagem em
   `ingestChatAttachments` — não no orchestrator. A transcrição vira o texto da
   mensagem do turno. Reusa padrão validado; zero acoplamento novo no
   orchestrator. (Alternativa rejeitada: transcrever dentro do orchestrator —
   mais round-trips, mistura mídia no pipeline de texto.)
2. **Glue pós-cadastro do Trilho B é determinístico no SERVIDOR**
   (`handleConfirm`), disparado por metadados `ocr_apply` na proposta.
   (Alternativa rejeitada: agente encadeia `apply_ocr_client_fields`+
   `criar_pendencia` como tools — exporia RPC service_role como tool e brigaria
   com a pausa `awaiting_confirmation`.)

## Reuso (nada de motor novo)

- `_shared/transcription/` — `getTranscriber` (engine por `TRANSCRIPTION_ENGINE`),
  `openaiWhisper` (`whisper-1`, `response_format=text`, `assertOpenAiDirect`),
  `stubTranscriber`. Contrato `Transcriber`/`TranscriberInput`.
- `_shared/ocr/openaiVisionExtractor.ts` — motor de visão OpenAI (engine
  `openai-vision`), já popula `chat_attachments.ocr_fields`/`ocr_confidence`.
- `apply_ocr_client_fields(client_id, jsonb)` — só-se-vazio, `needsReview=false`,
  CPF/RG cifrados server-side, erro isolado por campo, limiar 0.85. **Intacta.**
- Gravação MediaRecorder: `src/lib/attendanceAudio.ts` (`pickAudioMime`,
  `isRecordingSupported`) + `useAttendanceRecorder.ts` (padrão a copiar).
- ActionCard: `metadata.kind:"action_proposal"` + `proposeAction`/`handleConfirm`
  (reenvio `mode:"confirm"`). Front: `src/components/chat/ActionCard.tsx`.

---

## Trilho A — Áudio (gravar → revisar → enviar)

### Componentes

- **Hook `useChatVoiceRecorder`** (novo, `src/hooks/`): reusa `pickAudioMime`/
  `isRecordingSupported`; blob único `audio/webm;codecs=opus`; auto-stop em
  ~120 s; expõe `{ supported, recording, elapsedMs, start, stop, error }` e
  entrega o `Blob` final via callback. Não rotaciona (diferente do atendimento).
- **Botão de mic** em `JurisChatPanel.tsx` (~linha 605): **substitui** o mic de
  ditado (`useDictation`/Web Speech). Renderizado só se
  `TRANSCRIPTION_ENABLED && supported`. Enquanto grava: quadrado STOP + cronômetro.
- **Lib `transcribeVoiceMessage(sessionId, userId, blob)`** (`src/lib/`): sobe ao
  bucket `chat-attachments` (`${userId}/${sessionId}/${ts}_voice.webm`), cria a
  linha `chat_attachments` (mime `audio/webm`, `extracted_text=null`), invoca
  `transcribe-audio` síncrono com timeout (~15 s, igual ao OCR), devolve
  `{ text, ok }`. Timeout/erro → `{ text:"", ok:false }` (não quebra).
- **Edge nova `transcribe-audio`** (molde do `ocr-attachment`):
  - `verify_jwt=false`; auth por **JWT do caller + RLS** de `chat_attachments`
    (posse). Sem secret interno (não há trigger; único caller é o front autenticado).
  - Gate `TRANSCRIPTION_ENABLED` via `getRuntimeSecret` (env → `edge_runtime_secrets`);
    OFF → `{ ok:false, reason:"transcription_disabled" }`.
  - Download service-role do bucket `chat-attachments`.
  - `getTranscriber(getSecret)` com `getSecret` híbrido (env → BYOK para
    `OPENAI_API_KEY`, igual ao `transcribe-attendance-audio`/`ocr-client-document`).
  - `transcribe({ bytes, mimeType, language:"pt" })`; vazio → `{ok:false}`.
  - `UPDATE chat_attachments SET extracted_text = <texto>` na linha.
  - Log best-effort em `ai_generations`: `source="transcribe-audio"`,
    `provider="openai"`, `model=<TRANSCRIPTION_MODEL|whisper-1>`,
    `stage="transcribe"`, `status="ok"`, `input_tokens=0`, `output_tokens=0`,
    `user_id=<caller>`.
- **Orchestrator (mínimo):** `loadCaseDocuments` passa a **excluir anexos
  `audio/*`** (seleciona `mime_type` e filtra). Voz é comando, não prova de caso —
  senão "crie uma pendência" marcaria `hasReadableDocs=true` e distorceria o
  classificador.
- **Flags:** `VITE_TRANSCRIPTION_ENABLED` (front, espelho do `VITE_OCR_ENABLED`
  em `ingestChatAttachments`) + `TRANSCRIPTION_ENABLED`/`TRANSCRIPTION_ENGINE`/
  `TRANSCRIPTION_MODEL` em `edge_runtime_secrets` (falta setar
  `TRANSCRIPTION_ENGINE=openai`).

### Fluxo

mic grava → para (≤120 s) → garante sessão (parent) → `transcribeVoiceMessage`
(upload + `transcribe-audio`) → texto cai no campo de digitação → usuário
revisa/edita → envia normal (`handleSend`/`startOrchestration`).

### Erros / degradação

- Sem `MediaRecorder`/`getUserMedia` ou `TRANSCRIPTION_ENABLED=false` → mic some.
- Transcrição vazia/timeout/erro → aviso curto, campo continua editável; nada bloqueia.
- Passou de 120 s → auto-stop e transcreve o que houver.

### Critério de aceite A

Áudio "crie uma pendência de teste pra amanhã pra mim" → (após revisar/enviar)
pendência correta no Kanban; `chat_attachments.extracted_text` com a transcrição;
linha em `ai_generations` com `source=transcribe-audio`. Flag OFF → mic some,
nada quebra.

---

## Trilho B — Documento→ação

### Componentes

- **`doc_type` no OCR vision** (`openaiVisionExtractor.ts`): acrescenta ao
  `VISION_PROMPT` o campo `doc_type` (enum `identidade|cnh|comprovante_residencia|
  extrato_inss|contracheque|procuracao|outro`) e o materializa como um `OcrField`
  `{ key:"doc_type", value, confidence, method:"llm", needsReview:false }`,
  gravado em `chat_attachments.ocr_fields`. **Fora de `FIELD_TO_CADASTRO`** →
  nunca auto-preenche cadastro. `ocr-client-document.buildNotes` ignora/filtra
  `doc_type` (cosmético).
- **Orchestrator lê `ocr_fields`/`doc_type`/`ocr_confidence`** (hoje ignora):
  `loadCaseDocuments` seleciona esses campos; um novo bloco estruturado é injetado
  no contexto do especialista de cadastro/recepção — tipo do doc, campos com
  confiança e marca `[REVISAR]`, confiança geral.
- **Prompt do agente de cadastro/recepção** (`agents.system_prompt`, no banco):
  fluxo agentic —
  - doc de identidade com CPF → `consultar_cliente` (busca por CPF);
  - **não encontrado** → propõe `cadastrar_cliente` via ActionCard ("Identifiquei
    um RG de FULANO (CPF …). Cadastrar como cliente?");
  - **CPF já cadastrado** → propõe **atualizar campos vazios / anexar documento**
    ao cliente existente; **nunca duplica**.
- **Glue pós-confirmação (servidor, determinístico):** quando a proposta é
  `cadastrar_cliente` **originada de OCR**, o orchestrator anexa
  `metadata.ocr_apply = { fields, attachmentId, faltantes[] }` à proposta (o
  orchestrator, não o LLM, conhece o anexo/ocr_fields do turno). No
  `handleConfirm`, após criar o cliente (`result.id`):
  1. `apply_ocr_client_fields(id, fields)` (só-se-vazio, alta confiança);
  2. `criar_pendencia` "Completar cadastro de FULANO" com a **lista determinística
     de faltantes** (campos vazios + os que vieram `[REVISAR]`), computada no servidor.
- **CPF já existe (critério 3):** proposta de **atualizar** o cliente existente
  (confirmável, chama `apply_ocr_client_fields(existente, fields)`); nunca cria
  novo cliente.
- **Auto-fill conservador:** `apply_ocr_client_fields` intacta — só CPF válido+único
  e demais campos vazios de `needsReview=false`; **limiar 0.85 não muda**.

### Erros / degradação

- `OCR_ENABLED` OFF → imagem sem `ocr_fields`/`doc_type` → fluxo atual intacto.
- Confiança baixa → tudo `[REVISAR]`, nada auto-preenche, tudo entra na pendência.

### Critérios de aceite B

- Foto de RG → ActionCard → confirmar → `clients` criado + campos OCR aplicados +
  `user_tasks` (pendência "completar cadastro") com a lista de faltantes.
- RG de CPF já cadastrado → propõe atualizar, **não duplica**.

---

## Config / deploy

- `edge_runtime_secrets`: garantir `TRANSCRIPTION_ENABLED=true`,
  `TRANSCRIPTION_ENGINE=openai`, `TRANSCRIPTION_MODEL=whisper-1`.
- Front: `VITE_TRANSCRIPTION_ENABLED` (Cloudflare Pages, build-time).
- Deploys: `transcribe-audio` (nova), `chat-orchestrator` (alterado),
  `ocr-attachment` (doc_type via `_shared/ocr`), front, rebuild Cloudflare Pages.

## Fora de escopo / limitações

- **Custo do Whisper por minuto não é calculado** — loga a linha
  `source=transcribe-audio` com tokens 0 (atende o critério; cálculo por minuto =
  follow-up).
- `comprovante_residencia→endereço` e `extrato_inss→§24.1` (briefing B.4) =
  extensão futura.

## Plano de testes

- **A:** unit do recorder (pick de mime / auto-stop); edge `transcribe-audio` com
  `stubTranscriber` (gate off / vazio / ok); teste do filtro `audio/*` em
  `loadCaseDocuments`.
- **B:** extractor com `doc_type` (prompt + field materializado); injeção do bloco
  de contexto no orchestrator; glue determinístico (mock de
  `apply_ocr_client_fields` + `criar_pendencia`); montagem da lista de faltantes.
