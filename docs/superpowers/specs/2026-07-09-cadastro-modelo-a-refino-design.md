# CADASTRO-MODELO-A-REFINO — design

**Data:** 2026-07-09
**Base:** refina o `ClienteFormWizard` + o painel pós-cadastro (`ClientDocumentsPhase`) já em produção (CADASTRO-MODELO-A).
**Escopo desta rodada:** Bloco A (pontos 1–6) + o **Resolvedor de cliente** (base do ponto 7). As telas de reabertura por edição/anexos no chat (o "último passo" do ponto 7) ficam para um ciclo seguinte.

## Contexto verificado (achados que ajustam o briefing)

- **Telefones comercial/residencial não chegam aos documentos gerados.** `src/lib/cooperadoDocs.ts:142` mapeia só `telefone: c.phone`; `phone_commercial`/`phone_home` não são mapeados e nem vêm de `clients_decrypted` (`cooperadoOnboarding.ts` `DECRYPTED_COLS`). Só a ficha do cooperado usa `{{telefone}}`. Logo o `[A PREENCHER]` desses campos aparece na **revisão do wizard** (`renderReview` marca todo vazio como `[A PREENCHER]`), não no .docx. → ponto 2 é conserto de UI.
- **CHECK de `document_type` em produção** (verificado no banco real) aceita `contrato_honorarios` e `declaracao_hipossuficiencia` (além de `rg, cpf, comprovante, procuracao, contrato, termo_cooperado, extrato_conta, extrato_ir, ...`). Gravar o "assinado" com o mesmo `document_type` do gerado é válido. → ponto 6 OK.
- **Status de upload:** `uploadClientDocument` (`src/lib/clientDocuments.ts`) insere sem `status` → cai no default `'pendente'`. CHECK de status: `pendente|recebido|validado|rejeitado`.
- **Checklist:** `client_cooperado_checklist` computa status real por `document_type` (precedência `validado>recebido>pendente>rejeitado>ausente`). `DOC_STATE_LABEL` (`ClienteFormWizard.tsx:618`) mapeia `pendente→"Pendente de assinatura"`, `recebido→"Recebido"`, etc.
- **Resolvedor de cliente: AUSENTE.** Só há buscas cruas (`agent_consultar_cliente` no edge, `search_clients` no front) que devolvem 0..10 linhas sem lógica de 1/N/0.

## Bloco A — pontos 1 a 6 (front, sem `db push`, sem edge)

### 1. Card cabe no viewport do chat
- CSS (`src/styles/clientes.css`): em `.cli-wizard-chat` (ou um wrapper novo), limitar altura ao viewport do chat — `max-height: min(72vh, 640px)` no card, com o corpo da etapa (`.cli-formgrid`) em `overflow-y:auto` e o cabeçalho de passos + ações fixos. Scroll **interno** só quando uma etapa transborda; a página do chat não rola.
- `scrollIntoView`: ao montar o wizard no chat, `ref` no card + `scrollIntoView({block:"nearest"})` num `useEffect`. Rolar também ao trocar de etapa (para o topo do card).
- Escopo: só `variant="chat"` (a página `/clientes/novo` continua como está).

### 2. "Não possui" para tel. comercial e residencial
- Em `renderContato`, adicionar toggle "não possui" por telefone opcional (comercial e residencial), no padrão do PIX: ao marcar, desabilita+limpa o input e o payload grava a **string `"não possui"`** na coluna (`phone_commercial`/`phone_home`).
- Estado: dois flags locais (`phoneCommNone`, `phoneHomeNone`), inicializados a partir de `initialValues` (`=== "não possui"`).
- Revisão (`renderReview`): campo **opcional** com valor `"não possui"` mostra "não possui"; opcional **vazio** mostra "—" (nunca `[A PREENCHER]`). `[A PREENCHER]` na revisão passa a valer só para campos marcados como doc-críticos/obrigatórios de fato. (Escopo mínimo: aplicar a regra aos telefones; a nota da revisão é ajustada para refletir isso.)

### 3. Fechar wizard + "Cadastro concluído"
- Após `save_client` OK (`mode==="create"`), já troca para `ClientDocumentsPhase` (o form de 5 etapas some). Tornar explícito: o título da fase de documentos passa a "Cadastro concluído" (com o nome do cliente como subtítulo), deixando claro que o cadastro foi gravado e o form não está mais editável.

### 4. Upload grava `status='recebido'` + checklist real
- `uploadClientDocument`: passar `status: 'recebido'` (e `origem: 'recepcao'`) no insert. (Ver refactor do helper no ponto 6.)
- O checklist "Conjunto obrigatório" já exibe o status real via `client_cooperado_checklist`; com o upload em `recebido`, o item de RG/comprovante mostra "Recebido". `DOC_STATE_LABEL` mantém `pendente→"Pendente de assinatura"` — que agora só afeta os **gerados** (inseridos como `pendente`).

### 5. Botão "Enviado" + inputs desabilitados
- Novo estado `uploadedSlots: Set<ClientDocSlot>` (ou `sent: boolean`) setado em `handleUpload` após sucesso (`ok.length`).
- Inputs de `CLIENT_DOC_SLOTS` desabilitam para os slots já enviados; o botão vira "Enviado" quando todos os selecionados subiram. Reenvio só por ação explícita ("substituir"), se necessário (nice-to-have, não obrigatório).

### 6. Upload do "assinado" abaixo de cada gerado (card [6.5])
- Em `ClientDocumentsPhase`, abaixo de cada chip de documento gerado (`okGenerated.map`), após o usuário baixar (`openSignedDoc`), exibir um `<input type="file">` "Anexar assinado".
- Ao anexar → gravar em `client_documents` com o **mesmo `document_type` do gerado** (`g.documentType`) e `status='recebido'`, `origem='recepcao'`. O checklist (precedência) move o item de "Pendente de assinatura" → "Recebido".
- Mensagem "anexado/recebido" (mesmo padrão do ponto 4) + recarregar o checklist.

### Refactor do helper de upload (habilita 4 e 6)
- Generalizar `uploadClientDocument` para aceitar `status` e `origem` (defaults compatíveis) e permitir `document_type` explícito (para o assinado, que não é um "slot"). Ex.:
  - `uploadClientDocument(clientId, clientName, uploadedBy, { documentType, documentName, file, status='recebido', origem='recepcao' })`.
  - `CLIENT_DOC_SLOTS` continuam resolvendo `documentType` via `DOC_TYPE_BY_SLOT[slot]`.
- Atualizar `clientDocuments.test.ts` (contrato do mapa continua válido).

## Resolvedor de cliente (base do ponto 7)

**Onde:** `supabase/functions/chat-orchestrator/clientResolver.ts` — lógica pura + testes Deno. É onde o disparo do ponto 7 vai chamar (detecta intenção → resolve cliente → emite `metadata.kind` com `client_id`).

**Contrato:**
- `extractClientQuery(message: string): string | null` — extrai o trecho identificador do cliente da frase ("...do cliente **João Silva**", "cadastro de **Maria**", um CPF). Regex/heurística conservadora; retorna `null` se não achar.
- `resolveClient(search, query): Promise<ClientResolution>` onde `search(q) => Promise<ClientHit[]>` é injetado (na prod, envolve `agent_consultar_cliente`). Decisão:
  - **0 hits →** `{ status: "none" }`
  - **1 hit →** `{ status: "resolved", client }`
  - **N hits →** `{ status: "ambiguous", candidates }` (para o chat perguntar "qual?"). CPF exato (numérico) tende a 0/1.
- Tipos: `ClientHit { id, full_name, cpf_masked?, city? }`, `ClientResolution` união discriminada.

**Testes (Deno):** extração de nome de várias frases; decisão 0/1/N; CPF numérico → exato. Sem rede (search injetado).

**Fora de escopo desta rodada:** a detecção de intenção nova (`isEditarClienteRequest`/`isAnexosClienteRequest`), os novos `metadata.kind` (`editar_form`/`anexos_form`), os ramos de render inline no `JurisChatPanel`/`ChatWithAgent`, e o deploy do edge. Isso é o "último passo" do ponto 7, num ciclo seguinte — mas o Resolvedor já fica pronto e testado.

## Restrições / princípios
- Sem `db push` (R-2). Pontos 4/6 usam colunas já existentes de `client_documents`.
- `CHAT_TOOLS_ENABLED` global OFF (não afeta nada aqui).
- `[A PREENCHER]` só para obrigatório realmente ausente; opcional "não possui" nunca vira `[A PREENCHER]`.
- Testes rodam no CI (Vercel) — sem runtime Node local. Front commitado por PR; edge (quando o ponto 7 for wired) deploy via CLI já disponível.

## Critérios de aceite (Bloco A + Resolvedor)
1. Form cabe na conversa sem scroll de mouse; uma etapa por vez (scroll interno só se transbordar).
2. "não possui" em tel. comercial/residencial grava `"não possui"`; revisão não mostra `[A PREENCHER]` para eles.
3. Após confirmar, o wizard fecha e aparece "Cadastro concluído".
4. Enviar RG/comprovante → `client_documents.status='recebido'` → checklist mostra "Recebido".
5. Botão vira "Enviado" e desabilita os inputs enviados.
6. Slot de upload do assinado após o download; anexar → `status='recebido'` e o obrigatório sai de "Pendente de assinatura".
7. (Resolvedor) `resolveClient` decide 0/1/N corretamente e `extractClientQuery` extrai o nome/CPF — coberto por testes Deno. (As telas de reabertura no chat ficam para o próximo ciclo.)
