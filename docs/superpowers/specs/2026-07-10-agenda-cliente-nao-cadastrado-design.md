# Agenda no chat — cliente não cadastrado → cadastro em linha → agendamento automático

**Data:** 2026-07-10
**Escopo:** somente front-end (React). Sem DDL, sem alteração no edge `chat-orchestrator`.

## Problema

No cartão de agendamento pelo chat (`ReuniaoConfirmCard`, `kind:"reuniao_confirm"`),
quando a resolução de cliente retorna **0 candidatos**, o cartão apenas bloqueia com o
texto *"Vincule um cliente cadastrado antes de agendar"*. O dono quer que, nesse caso,
o sistema encaminhe para o **cadastro** (o mesmo fluxo já usado) e, ao concluir, **grave
o agendamento automaticamente** com os dados já capturados (data/hora/tipo/advogado),
sem o usuário repetir nada.

## Correção de premissa (vs. briefing original)

O briefing assumia o **"Modelo B"** (coleta conversacional campo-a-campo no edge, com
estado reconstruído de `chat_sessions.metadata`). **Isso não corresponde ao código
atual.** O cadastro pelo chat é o **Modelo A**:

- O edge só insere uma mensagem `metadata.kind="cadastro_form"`
  (`chat-orchestrator/index.ts:3072-3096`).
- O front (`JurisChatPanel.tsx:478-487`) monta o **`ClienteFormWizard` inline** (wizard
  de 5 etapas), que grava via RPC `save_client` (cifrada) — **tudo client-side**; o edge
  **não participa** da gravação do cliente.
- O `ClienteFormWizard` **já expõe** `onSaved(clientId, clientName)`, mas hoje é montado
  no chat **sem** esse callback.

**Consequência:** persistir o rascunho em `chat_sessions.metadata` (proposta do
briefing) seria complexidade sem ganho — a leitura/limpeza teria de ser client-side de
qualquer forma. **Decisão aprovada:** guardar o rascunho em **estado React** no
container `JurisCloudOS`.

## Decisões aprovadas

1. **Mecanismo de estado:** estado client-side (React) no `JurisCloudOS`. Sem banco,
   sem edge. Trade-off aceito: reload no meio do cadastro perde o rascunho — simétrico
   ao próprio progresso do wizard, que também não é persistido.
2. **Fase de documentos:** o cadastro originado da agenda passa pelo **fluxo Modelo A
   completo** (fase de documentos COOP-DOCS), igual a qualquer cadastro pelo chat. Sem
   comportamento condicional novo no wizard.

## Arquitetura — fluxo em 4 movimentos

### 1. Detecção + botão (`ReuniaoConfirmCard.tsx`)

Estado atual "0 candidatos e sem cliente resolvido" (`!clientId &&
draft.client_candidates.length === 0 && !draft.client_resolved`): trocar o texto de
bloqueio por **"Cliente não encontrado. Cadastrar agora?"** + botão **Cadastrar
cliente**.

Ao clicar, o cartão chama uma nova prop `onCadastrarCliente(snapshot)` passando um
**snapshot ao vivo** do que já foi preenchido — para não perder trabalho:

```ts
interface PendingMeeting {
  client_name_hint: string | null; // draft.client_query
  scheduled_date: string | null;   // estado `date` do cartão
  start_time: string | null;       // estado `time`
  type: string | null;             // estado `type`
  lawyer_user_id: string | null;   // estado `lawyer` (pode ser "" se não escolhido)
  lawyer_hint: string | null;      // draft.lawyer_hint
  phone: string | null;            // estado `phone`
  display: string | null;          // draft.display
}
```

O cartão também passa a **inicializar `lawyer`** a partir de um novo campo opcional
`draft.lawyer_user_id` (para pré-selecionar o advogado ao reabrir — ver movimento 3).

### 2. Iniciar cadastro preservando o rascunho (`JurisCloudOS.tsx`)

Handler `handleCadastrarClienteFromMeeting(snapshot)`:

1. `setPendingMeeting(snapshot)`.
2. Monta `cadastroInitialValues = { ...EMPTY_FORM, full_name: (hint ?? "").toUpperCase() }`
   (pré-preenche o Nome).
3. **Injeta uma mensagem local** `kind:"cadastro_form"` no estado `messages`
   (id `local_cadastro_<n>`, role `assistant`, mesmo texto "Preencha o formulário…").
   Sem round-trip no edge, sem balão de usuário extra.

O wizard monta pré-preenchido (movimento 3).

### 3. Wizard grava → conclui o agendamento (wire do `onSaved`)

`JurisChatPanel` passa ao wizard inline `onSaved={onClienteCadastrado}` e
`initialValues={cadastroInitialValues}`. Como `handleConfirm` chama `setSavedId` **e**
`onSaved` (linhas 267-268), a fase de documentos continua aparecendo normalmente — o
`onSaved` é **aditivo**.

Handler `handleClienteCadastrado(clientId, clientName)` no container:

- Se `pendingMeeting == null` → **não faz nada** (cadastro normal, digitado pelo
  usuário). Garante o critério de aceite 5.
- Senão, **consome e limpa** `pendingMeeting`, e:
  - **Snapshot completo** (`scheduled_date && start_time && type && lawyer_user_id`):
    chama `createMeeting({ p_client_id, p_scheduled_date, p_start_time, p_type,
    p_lawyer_user_id, p_phone, p_status:"scheduled" })`.
    - **Sucesso** → injeta mensagem local de confirmação:
      *"Cliente {nome} cadastrado e atendimento agendado para {display}."* O advogado é
      notificado pelo **trigger existente** de `meetings` (`meeting_created`).
    - **Falha** (slot inválido/ocupado/passou) → cliente permanece cadastrado; injeta
      aviso *"…mas o horário {display} não está mais disponível. Escolha um novo
      horário abaixo."* + **reabre cartão** (abaixo).
  - **Snapshot incompleto** (ex.: advogado não escolhido) → injeta *"Confirme os dados
    do atendimento abaixo."* + **reabre cartão**.

**Reabrir cartão** = injeta mensagem local `kind:"reuniao_confirm"` com
`reuniaoDraft`:

```ts
{
  scheduled_date, start_time, type, display,          // preservados do snapshot
  lawyer_hint: snapshot.lawyer_hint,
  lawyer_user_id: snapshot.lawyer_user_id || null,    // pré-seleciona o advogado
  phone: snapshot.phone,
  client_query: clientName,
  client_resolved: { id: clientId, name: clientName, cpf_masked: null, status: null },
  client_candidates: [],
}
```

`client_resolved` preenchido faz `clientOk === true`; o usuário só escolhe um slot
válido e confirma pelo **caminho normal** do cartão (`create_meeting`).

### 4. Gates preservados

O agendamento pós-cadastro passa **sempre** por `create_meeting` / `get_available_slots`
(nunca duplica validação de slot/capacidade) e respeita o **advogado obrigatório** e o
padrão 0/1/N — exatamente como o agendamento normal.

## Arquivos tocados (só front)

| Arquivo | Mudança |
|---|---|
| `src/components/juris-cloud/types.ts` | `ReuniaoDraft.lawyer_user_id?: string \| null` (opcional); tipo `PendingMeeting`. |
| `src/components/chat/ReuniaoConfirmCard.tsx` | Botão "Cadastrar cliente" no estado 0-candidatos; init de `lawyer` por `draft.lawyer_user_id`; prop `onCadastrarCliente`. |
| `src/components/juris-cloud/JurisChatPanel.tsx` | Props `onCadastrarClienteFromMeeting`, `onClienteCadastrado`, `cadastroInitialValues`; thread até `MessageBubble`→`ReuniaoConfirmCard`; wire `onSaved`/`initialValues` no wizard inline. |
| `src/components/JurisCloudOS.tsx` | Estado `pendingMeeting`/`cadastroInitialValues`; handlers `handleCadastrarClienteFromMeeting` e `handleClienteCadastrado`; injeção de mensagens locais; import de `createMeeting` e `EMPTY_FORM`. |
| Testes | `ReuniaoConfirmCard.test.tsx`: botão aparece com 0 candidatos e dispara callback com o snapshot. `JurisChatPanel.cadastro.test.tsx`: `onSaved`/`initialValues` chegam ao wizard. |

## Critérios de aceite

1. "agende para X com o cliente Y (não cadastrado)" → cartão mostra "Cliente não
   encontrado. Cadastrar agora?" com **botão** (não só texto pedindo CPF).
2. Clicar → inicia o wizard na mesma conversa, Nome pré-preenchido, rascunho preservado
   em estado (não visível como campo).
3. Concluir cadastro → atendimento criado automaticamente com o `client_id` novo, mesma
   data/hora/tipo/advogado; advogado notificado.
4. Slot deixou de ser válido → cliente permanece cadastrado; chat informa e **reabre**
   cartão pré-preenchido para novo horário (não perde o cadastro).
5. Rascunho pendente **não reaparece** em cadastros futuros não relacionados na mesma
   sessão (consumido e limpo; só existe quando disparado pelo cartão).

## Fora de escopo

- Persistência do rascunho em banco / sobrevivência a reload.
- Alterações no edge `chat-orchestrator`.
- Mudança no comportamento do modal manual da Agenda (que segue permitindo prospect).
- Alteração na fase de documentos do Modelo A.
