# TRILHA C · Ciclo 1 — Gravação de áudio real do atendimento (cards 6.1 + 2.6)

**Data:** 2026-07-09
**Branch:** `claude/trilha-c-audio-atendimento`
**Status:** design aprovado (brainstorming) → aguardando revisão do spec

---

## 1. Objetivo e escopo

Entregar a **gravação real do áudio de um atendimento como arquivo/prova**, vinculada ao
cliente, com **segmentação automática em blocos de ~10 min sem interromper a gravação** e
**upload incremental** de cada bloco.

- O card **2.6** (ditado fala→texto no chat, `webkitSpeechRecognition`) **já está pronto**
  em `src/components/JurisCloudOS.tsx`. Cards 6.1 e 2.6 são o mesmo trabalho; este ciclo
  entrega a metade que faltava: a **gravação real (prova)**.
- O **gancho de transcrição** fica pronto (seam bem definido) mas **não é implementado**
  aqui — é outra track.

### Fora de escopo (YAGNI)
Pausar/retomar, transcrição, edição/trim de áudio, flag de `CHAT_TOOLS` (é feature de UI da
ficha do cliente, não comando de chat).

---

## 2. Decisões de design (tomadas no brainstorming)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Destino/armazenamento do áudio | `client-documents` (bucket já existente) + `document_type='audio_atendimento'` (tipo novo). Reusa 100% do padrão de `src/lib/clientDocuments.ts`. |
| 2 | Ponto de entrada | Ficha do cliente (`ClientDetails`), aba **"Áudios/Transcrições"** (`AudiosTab`). `client_id` já está no contexto — zero ambiguidade de vínculo. |
| 3 | Modelo "1 atendimento = N blocos" | 1 linha em `client_documents` **por bloco**, todos agrupados pelo mesmo `session_id`. |
| 4 | Timing do upload | **Incremental**: cada bloco de ~10 min sobe assim que fecha, enquanto a gravação continua (resiliência a crash/fechar aba). |
| 5 | Motor de gravação | **Rotação stop/restart** num `MediaStream` único → blocos WebM completos e tocáveis; gap sub-segundo entre blocos (aceito). |

---

## 3. Arquivos

| Arquivo | Ação | Responsabilidade única |
|---|---|---|
| `supabase/migrations/<ts>_audio_atendimento_doc_type.sql` | **novo** | `apply_migration` **aditivo**: adiciona `'audio_atendimento'` ao CHECK `client_documents_document_type_check`. Sem `db push`. |
| `src/lib/attendanceAudio.ts` | **novo** | Helpers puros/testáveis: gerar `session_id`, montar `file_path`/`document_name`, `buildAudioDocInsert` (reusa `buildDocInsert` de `clientDocuments.ts`), `uploadAttendanceBlock`, parse/agrupamento de blocos por sessão a partir do `file_path`/`notes`. |
| `src/hooks/useAttendanceRecorder.ts` | **novo** | Motor de gravação (getUserMedia + MediaRecorder com rotação), máquina de estado, fila de upload incremental, estado por bloco. |
| `src/components/clients/tabs/chatTabs.tsx` | **editar** | Seção nova na `AudiosTab`: gravador (⏺/⏹ + timer + blocos com status/retry) e listagem dos atendimentos gravados agrupada por `session_id` (lê `client_documents`). Preserva a listagem `chat_attachments` atual. |

---

## 4. Migration (aditiva)

Expandir o CHECK de `document_type` para incluir `'audio_atendimento'`. O CHECK atual
(migration `20260707135855_client_documents_types_status_events.sql`) é um SUPERSET; apenas
acrescentamos um valor. Idempotente (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`).

> **R-2 / desync repo↔banco:** COOP-DOCS-1 já está em produção. Esta migration é aditiva e
> aplicada via `apply_migration` (MCP), **não** `db push`. Não duplicar `schema_migrations`.

Vocabulário resultante:
`rg, cpf, comprovante, procuracao, contrato, termo_cooperado, outro, comprovante_residencia,
extrato_conta, extrato_ir, extrato_inss, cnis, certidao, audio_atendimento`.

---

## 5. Motor de gravação (`useAttendanceRecorder`)

Máquina de estado: `idle → recording → idle` (sem pausa neste ciclo).

- **`start(clientId, clientName)`**
  - `navigator.mediaDevices.getUserMedia({ audio: true })` → 1 `MediaStream`.
  - `session_id = crypto.randomUUID()`, `blockIndex = 0`, `startedAt = now`.
  - `MediaRecorder` com `mimeType` resolvido por `MediaRecorder.isTypeSupported`
    (`audio/webm;codecs=opus` → `audio/webm` → default). `start(1000)` (timeslice 1 s),
    acumulando chunks no buffer do bloco corrente (`ondataavailable`).
  - Timer de rotação `setInterval(rotate, ROTATE_MS)` (default ~10 min).
- **`rotate()`** (interno, invisível ao usuário)
  - `recorder.stop()` → no `onstop`: monta `Blob(buffer, {type: mime})`, **enfileira upload**
    do bloco `{session_id, blockIndex, blob, startedAt, durationMs}`, limpa buffer,
    `blockIndex++`.
  - `recorder.start(1000)` de novo no **mesmo stream** (não recria getUserMedia).
- **`stop()`**
  - Cancela o timer, `recorder.stop()` (último bloco montado+enfileirado), encerra
    `stream.getTracks().forEach(t => t.stop())` → volta a `idle`.
- **Fila de upload sequencial** (evita corrida e dá backpressure)
  - Cada bloco → `uploadAttendanceBlock(clientId, clientName, uploadedBy, block)`.
  - Estado por bloco exposto: `uploading | done | error`.
  - Retry por bloco; o `Blob` permanece em memória até `done` (ou até o usuário baixar).

**Constantes injetáveis** para teste: `ROTATE_MS`, `TIMESLICE_MS`, e uma fábrica de
`MediaRecorder` mockável.

---

## 6. Modelo de dados (sem schema novo além do CHECK do §4)

Uma linha em `client_documents` **por bloco** (via `buildDocInsert` de `clientDocuments.ts`):

| Campo | Valor |
|---|---|
| `document_type` | `'audio_atendimento'` |
| `status` | `'recebido'` |
| `origem` | `'recepcao'` |
| `mime_type` | `'audio/webm'` (ou o resolvido) |
| `file_path` | `${clientId}/atendimento/${sessionId}/${blockIndex}_${ts}.webm` — **fonte de verdade do agrupamento** (prefixo por sessão) |
| `document_name` | `"Atendimento DD/MM/AAAA HH:MM — bloco N"` (rótulo humano) |
| `notes` | JSON `{"session_id","block_index","duration_ms","started_at"}` (belt-and-suspenders p/ listagem e futuro job de transcrição) |

Auditoria (`log_client_document_event`) dispara de graça no INSERT. Policies do bucket
`client-documents` e da tabela `client_documents` (`is_recepcao_or_socio`) são reusadas — o
atendente que abre a ficha já é recepção/sócio (`ALLOWED_ROLES`).

**Gancho de transcrição (seam, não implementado):** um job futuro varre linhas
`document_type='audio_atendimento'` sem transcrição associada, ordenadas por `block_index`
dentro de cada `session_id`.

---

## 7. UI (aba "Áudios/Transcrições")

A `AudiosTab` ganha duas seções acima da listagem `chat_attachments` atual (que permanece):

1. **"Gravar atendimento"** — botão ⏺ Gravar / ⏹ Parar, timer corrido, e mini-lista dos
   blocos da sessão em curso com status/progresso e botão de retry por bloco. Botão
   desabilitado (com dica) se não houver suporte a `MediaRecorder`/mic.
2. **"Atendimentos gravados"** — agrupa `client_documents` (`document_type='audio_atendimento'`)
   por `session_id`: data/hora, nº de blocos, duração total; cada bloco com
   `createSignedUrl` + `<audio controls>` para tocar. Texto "Transcrição ainda não
   disponível." por bloco (reusa o texto existente) até a track de transcrição existir.

---

## 8. Tratamento de erro / bordas

- **Sem permissão de mic / sem `MediaRecorder`:** toast + botão desabilitado (espelha a
  detecção `speechSupported` do ditado em `JurisCloudOS.tsx`).
- **Falha de upload de um bloco:** marca `error`, oferece retry; salvaguarda "baixar bloco"
  se persistir (não perder prova). O `Blob` fica em memória até resolver.
- **Fechar aba durante gravação/upload pendente:** listener `beforeunload` avisa.

---

## 9. Testes

- **Unit (vitest, padrão de `src/lib/clientDocuments.test.ts`):** `attendanceAudio.ts` —
  naming (`file_path`/`document_name`), `buildAudioDocInsert`, parse/agrupamento por
  `file_path`/`notes`.
- **Scheduler / fila (fake timers + `MediaRecorder` mockado):** rotação dispara nos limites
  corretos; a fila sobe blocos em ordem; retry após erro. Partes que tocam DOM ficam finas.

> Sem Node local (MEMORY: ambiente-local-sem-node-gh) — testes/build validam no CI Vercel.

---

## 10. Critérios de aceite

1. Grava o atendimento a partir da ficha do cliente.
2. Segmenta em blocos de ~10 min **sem o usuário reiniciar nada** (rotação interna).
3. Cada bloco sobe (upload incremental) para `client-documents` como `audio_atendimento`.
4. Todos os blocos ficam **lincados ao cliente** e agrupados por sessão, **recuperáveis** e
   tocáveis na aba "Áudios/Transcrições".
5. Gancho de transcrição pronto (seam), sem implementação.

**Validação:** na tela (gravar → ver blocos subindo → tocar) + no banco (linhas em
`client_documents` com `document_type='audio_atendimento'` e `file_path` agrupado).
