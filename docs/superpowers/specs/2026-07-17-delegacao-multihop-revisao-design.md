# Design — Delegação multi-hop + loop de revisão + glue da `salvar_peca`

Data: 2026-07-17 · Alvo: `supabase/functions/chat-orchestrator` (edge) + banco + Storage

## 1. Contexto e divergências entre o spec e o código real

O spec descreve o modelo-alvo do sócio: `Meu Assistente → Diretor → Executor → (revisão) → aprova/devolve → refaz`.
Antes de projetar, reconciliei o spec com o que existe hoje:

- **`delegate` não é uma tool inerte — ela nem chega ao runtime.** O roteamento atual é feito por um
  **LLM-roteador** (`chooseSpecialistAndAcaoTipo` / `chooseAgent`) dentro de uma máquina de estados fixa
  `routing_n1 → routing_n2 → executing_n3 → validating_n2 → validating_n1 → done`. No `tool_catalog`,
  `delegate` existe (categoria `native`, ativa) e **já está concedida** ao `Meu Assistente` e aos diretores
  (`Diretor de Área/Operações/Financeiro/Jurídico — Revisão` só têm `delegate`), mas `tools/registry.ts`
  **não a registra**, então o modelo nunca a recebe. → "deixar de ser inerte" = **registrar + implementar** a tool.
- **Não existe role `executor`.** Os executores são `role='specialist'` (44 ativos). O mapeamento do spec é:
  `diretor = role director`, `executor = role specialist`.
- **RPCs de revisão existem** com as assinaturas exatas do spec: `salvar_peca(...)`,
  `get_revisao_peca_context(p_task_id)`, `decidir_revisao_peca(p_task_id,p_decisao,p_observacoes,p_aceite)`.
  Porém `get_revisao_peca_context` e `decidir_revisao_peca` **não estão no `tool_catalog`** (serão adicionadas).
- **`salvar_peca`** grava `p_file_path` direto em `client_documents` (status `pendente`) e cria a `user_tasks`
  `revisar_peca`. Reviewer default = **o próprio autor** (`coalesce(p_reviewer_user_id, auth.uid())`) → auto-revisão,
  a evitar. Na **devolução**, `decidir_revisao_peca` só reabre a confecção **se** `payload.confeccao_task_id`
  estiver setado.
- **Não há bucket `pecas`.** O visualizador de documentos do cliente (`relationalTabs.tsx`,
  `RevisaoPecaPanel.tsx`, `chatTabs.tsx`) lê `client_documents.file_path` do bucket **`client-documents`**.
- **Tools de ESCRITA hoje PAUSAM** aguardando confirmação do usuário (`proposeAction`). `salvar_peca` **não**
  seguirá esse caminho: quem confirma é o **revisor humano** (a tarefa `revisar_peca`).

## 2. Decisões (fechadas com o autor do spec)

1. **Execução multi-hop:** **pilha de delegação persistida + hops** (`fireNextStep`). Cada turno de LLM de cada
   nível é UMA invocação do Edge → respeita o wall-clock (~400s) e o padrão atual do código.
2. **Bucket da peça:** **reusar `client-documents`** (caminho `pecas/<process|client>/<uuid>.md`), para a peça
   abrir na tela do cliente sem mexer no front.
3. **Devolução:** **próximo turno do redator** — sem processo em background. `decidir_revisao_peca('devolver')`
   reabre a confecção; o redator refaz quando for reacionado (novo run) já com as observações no contexto.
4. **Reviewer (resolvido no glue):** `reviewer_user_id = owner_user_id` do agente executor (o **sócio**, dono da
   árvore). É quem recebe a `revisar_peca` na caixa. Se o `auth.uid()` do turno for o próprio sócio, cai em
   auto-revisão (aceitável no caso sócio-solo; documentado como borda).
5. **Gating (reversível, padrão do código):** o caminho multi-hop só entra quando o agente de entrada tem
   `delegate` em `allowed_tools` **E** a flag nova `MULTIHOP_DELEGATION_ENABLED` está ligada. Caso contrário,
   a máquina de estados legada roda **inalterada** (nenhuma mudança para quem não é sócio até ligar a flag).

## 3. Tarefa 1 — Delegação multi-hop (a pilha)

### 3.1 Estado persistido
Nova coluna `orchestration_runs.delegation_stack jsonb` (default `null`). É uma **pilha** (array; topo = último):

```jsonc
// frame
{
  "agent_id": "uuid",
  "depth": 0,                       // 0 = agente de entrada (assistant_root)
  "messages": [/* LlmMessage[] */], // conversa acumulada DESTE agente (system é reconstruído do agent row a cada turno)
  "delegation_context": {           // null no frame raiz; preenchido pelo delegate do pai
    "objetivo": "…", "resumo": "…",
    "client_id": "uuid|null", "process_id": "uuid|null", "recipient_id": "uuid|null"
  },
  "pending_child_tool_call_id": "string|null" // id da tool-call `delegate` aguardando retorno do filho
}
```

### 3.2 A tool `delegate`
Registrada em `tools/registry.ts` (nova categoria de tratamento — **não** é read nem write comum):

```jsonc
delegate: {
  target:   "papel/área/nome do sub-agente (ex.: 'diretor jurídico', 'executor previdenciário', 'Especialista Cadastro')",
  objetivo: "o que o sub-agente deve fazer (imperativo, 1 frase)",
  resumo:   "contexto relevante já apurado (opcional)",
  client_id:  "uuid resolvido (opcional)",
  process_id: "uuid resolvido (opcional)"
}
```

### 3.3 Resolução do alvo (dentro do mesmo `owner_user_id` + globais)
`resolveDelegateTarget(delegatingAgent, target)`:
- Candidatos = sub-agentes ativos do **mesmo `owner_user_id`**, restritos por **hierarquia**:
  `assistant_root → director`; `director → specialist`; (+ especialistas GLOBAIS `owner IS NULL` que carregam
  tool, ex.: Distribuição — reusa `loadGlobalSpecialists`).
- Match determinístico por **tokens** com fold de acento sobre `role`/`name`/`description` (reusar a ideia do
  resolvedor de destinatário `txt_fold`). `0` candidatos → resultado de erro para a tool ("não encontrei
  sub-agente para '<target>'"); `>1` ambíguos → desempate por 1 chamada curta ao LLM-roteador
  (`chooseSpecialistAndAcaoTipo` já existe) restrita aos candidatos.

### 3.4 Máquina de estados (nova, gated)
Novo status `delegating`. No `START`/`routing_n1`, se `MULTIHOP_DELEGATION_ENABLED` **e** o agente de entrada
tem `delegate`: inicializa `delegation_stack = [frameRaiz(entry_agent)]`, `status='delegating'`, e salta.

Cada invocação em `delegating` processa **o frame do topo**, rodando o loop de tools **já existente**
(mesma forma do `executing_n3`: `callLLM` com `tools`, executa LEITURAS inline, realimenta `messages`), com estas saídas:

- **Emitiu `delegate`** → resolve alvo; aplica guardas (§3.5); grava `pending_child_tool_call_id`; **empilha**
  frame filho (`depth+1`, `delegation_context` dos args); `insertStage("<pai> acionou <filho>")`; `fireNextStep`.
- **Emitiu `salvar_peca`** (só executor) → glue da Tarefa 3 (§5), monta um `tool`-result com o resumo
  (`revisar_peca_task_id`, reviewer) e seta o frame para "concluir" → **desempilha** (abaixo).
- **Texto final, sem tool-calls** → resultado do frame = o texto.
- **Estourou o teto de iterações do frame** → resultado = melhor texto disponível (fail-safe).

**Desempilhar (pop):** grava o resultado do filho como mensagem `tool` (`tool_call_id =
pending_child_tool_call_id`) **no frame do pai**; `insertStage`; `fireNextStep` (o pai roda mais um turno para
reagir). Se o frame que concluiu é o **raiz** (sem pai) → o texto vira a **mensagem final** `assistant` e o run
vai a `done` (mesma finalização já usada pelo caminho ACAO).

### 3.5 Profundidade e anti-laço
- `MAX_DELEGATION_DEPTH = 4` (env). `delegate` além disso → resultado de erro para a tool (não derruba o run).
- **Anti-laço:** se o `agent_id` alvo já está na cadeia de ancestrais da pilha → recusa com erro na tool.
- Teto global de saltos por run (defesa DoS): `MAX_DELEGATION_HOPS` (ex.: 24).

### 3.6 Observabilidade (critério de aceite 1)
- 1 `chat_messages role=system kind=stage` por salto (`"<pai> acionou <filho> para <objetivo>"`,
  `"<executor> redigiu a peça; enviada para revisão de <reviewer>"`).
- `orchestration_runs.chain` acumula `{level: depth, agent, action:'delegate'|'salvar_peca'|'final'}`.

## 4. Tarefa 2 — Loop de revisão

### 4.1 Tools novas (expostas ao `Diretor Jurídico — Revisão`)
- `get_revisao_peca_context(task_id)` — **LEITURA** (`runReadTool` → `rpc('get_revisao_peca_context')`).
- `decidir_revisao_peca(task_id, decisao, observacoes, aceite)` — **ESCRITA** (`runWriteTool`). Descrição da
  tool deixa explícito: **`aprovar` exige `aceite=true`** (responsabilidade); o agente só aprova após o humano
  confirmar. `decidir_revisao_peca` roda sob o **JWT do usuário** (a RPC exige `assignee_user_id = auth.uid()`
  ou `is_master_admin`) — ou seja, quem conduz o chat de revisão precisa ser o revisor/sócio.
- Registro em `tool_catalog` (migração) + `registry.ts` + `handlers.ts` + **grant** ao `Diretor Jurídico —
  Revisão` via `agent_tools` (o trigger `sync_agent_allowed_tools` popula `allowed_tools`).

### 4.2 Fluxo (next-turn, decisão #3)
- **Aprovar:** `decidir_revisao_peca('aprovar', …, aceite=true)` → `revisar_peca` vira `completed`
  (critério 3). *Nota de política:* aceite legal por **agente** é possível pelo spec, mas o caminho humano
  (`RevisaoPecaPanel` na MyInbox, card 8.2) permanece — ver §8.
- **Devolver:** `decidir_revisao_peca('devolver', observacoes)` → a RPC reabre a **confecção**
  (`payload.confeccao_task_id`, ver §5) para `in_progress` e cancela a `revisar_peca`. O redator refaz **no
  próximo turno** (reacionado já com as observações da devolução no contexto). Repete até `aprovar`.

## 5. Tarefa 3 — Glue da `salvar_peca` (texto → Storage → RPC)

Handler dedicado no executor frame (fora do `proposeAction`; ver §1):
1. **Resolve reviewer** = `owner_user_id` do agente executor (o sócio). (Decisão #4.)
2. **Confecção task (para a devolução funcionar):** se o frame não trouxer um `confeccao_task_id`, **cria** uma
   `user_tasks` de confecção (tipo a definir no plano — `confeccionar_peca`/`redigir_peca`; senão, criar o
   task_type) atribuída ao redator, e passa seu id em `p_confeccao_task_id`. Assim `decidir_revisao_peca
   ('devolver')` tem o que reabrir (critério 3). *(Ponto a fechar no plano — ver §9.)*
3. **Upload** de `conteudo` (markdown) em **`client-documents`**, caminho
   `pecas/${process_id ?? client_id}/${crypto.randomUUID()}.md`, `contentType: 'text/markdown'`,
   `upsert:false`, via client **service-role** (garante escrita; leitura segue RLS de `client_documents`).
4. **RPC** `salvar_peca` sob o **JWT do usuário** (para `auth.uid()` = created_by/assigner correto):
   `p_client_id, p_document_name, p_file_path=path, p_process_id, p_document_type='peca',
   p_mime_type='text/markdown', p_reviewer_user_id=<sócio>, p_confeccao_task_id=<conf>`.
5. Retorna `{ client_document_id, revisar_peca_task_id, reviewer_user_id }` como resultado da tool.
6. **Grant `salvar_peca` aos executores** (specialists redatores) via `agent_tools` (migração aditiva) — só
   **depois** do glue existir (evita chamada quebrada).

Bucket `client-documents` já existe (privado, aceita markdown). **Não** criar bucket `pecas` (decisão #2);
as policies de leitura de `client_documents` já cobrem quem vê o processo/cliente.

## 6. Migrações (espelhos a commitar) e deploys

Migrações (aplicadas via MCP + espelho `.sql` no repo):
1. `orchestration_runs.delegation_stack jsonb`.
2. `tool_catalog`: inserir `get_revisao_peca_context` (consulta) e `decidir_revisao_peca` (acao).
3. `agent_tools`: grant das 2 tools de revisão ao `Diretor Jurídico — Revisão` (todos os donos).
4. `agent_tools`: grant `salvar_peca` aos executores (specialists redatores).
5. (Se necessário) `task_types` para a confecção + ajuste fino de `salvar_peca`/confecção — a decidir no plano.
6. Reserva para ajuste de policy/holes descobertos na validação.

Deploys do Code: `chat-orchestrator` (`--no-verify-jwt`) com multi-hop + loop + glue. **Nenhum bucket novo.**
Flags novas: `MULTIHOP_DELEGATION_ENABLED` (default off), `MAX_DELEGATION_DEPTH=4`, `MAX_DELEGATION_HOPS=24`.

## 7. Mapa dos critérios de aceite
- **(1)** ordem → diretor → executor → retorno sobe: §3.4 + stages/chain §3.6.
- **(2)** peça → arquivo no bucket + `client_documents` `pendente` + `revisar_peca`: §5 (validar no banco).
- **(3)** devolver reabre confecção e refaz; aprovar+aceite conclui: §4.2 + §5.2.
- **(4)** `delegate` deixa de ser no-op: §3.2/§3.4.

## 8. Riscos e pontos de política
- **Aceite legal por agente.** Deixar a IA aprovar com `aceite=true` transfere responsabilidade a um agente.
  Mantemos o caminho humano (`RevisaoPecaPanel`) intacto; a tool fica concedida ao Diretor de Revisão conforme
  o spec, mas recomenda-se manter a **aprovação final humana** por padrão. (Sinalizar ao Ryan; não bloqueia.)
- **Tamanho do `delegation_stack`.** A peça vive nos args de UMA tool-call (`salvar_peca`) do executor; ao
  desempilhar não reenviamos o texto para cima (o pai recebe só o resumo). Frames intermediários são "magros".
- **Custo/latência de N saltos.** Cada salto é uma invocação (cold start possível, ~13-15s já medido). Depth 4
  com refação → vários saltos; aceitável para o fluxo do sócio, medível via `ai_generations`.

## 9. A fechar no plano (implementação)
- Task type da **confecção** (existe `confeccionar_peca`/`redigir_peca`? senão criar) para §5.2.
- Reuso máximo do loop de tools do `executing_n3` (evitar duplicar `callLLM`/tratamento de `tool_calls`).
- Onde ancorar o gating no `START`/`routing_n1` sem tocar o caminho legado.

## 10. Fora de escopo (YAGNI)
- Reescrever o roteamento legado (LLM-roteador) — coexiste, gated.
- Aprovação estruturada campo-a-campo da revisão (adiada no card 8.2).
- Sync Google Agenda, notificações novas, UI nova de revisão (já existe `RevisaoPecaPanel`).
