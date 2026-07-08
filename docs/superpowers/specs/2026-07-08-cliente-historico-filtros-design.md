# CLIENTE-HISTORICO-FILTROS (FE) — Cards 3.8 e 3.9

> Data: 2026-07-08 · Escopo: front-end + 1 migration aditiva (não aplicada aqui).
> Backend já pronto e validado no banco (RPCs `client_timeline` e `search_clients`,
> ambas `SECURITY DEFINER`, restritas a recepção/sócio). Esta spec é a camada FE
> que as consome. Não recriar as RPCs nem suas migrations. Não rodar `db push`.

## Contexto verificado no banco (project `tsltxvswzdnlmvljpryh`)

### `client_timeline(p_client_id uuid)`
Retorna `TABLE(event_type text, event_at timestamptz, title text, ref_id uuid, extra jsonb)`,
ordenada por `event_at desc nulls last`. Gate: `is_recepcao_or_socio()` → senão `42501`.

Eventos emitidos e formato do `extra` (confirmado no corpo da função):

| event_type      | fonte / `ref_id`            | `extra`                                                        |
|-----------------|-----------------------------|----------------------------------------------------------------|
| `conversa`      | `chat_sessions.id`          | `{status, mensagens}`                                          |
| `tarefa`        | `user_tasks.id`             | `{status, prioridade, pendencia_tipo, data_fatal}`            |
| `pendencia`     | `user_tasks.id`             | `{status, prioridade, pendencia_tipo, data_fatal}`            |
| `aprovacao`     | `user_tasks.id`             | `{validated_by}`                                              |
| `documento`     | `client_documents.id`       | `{tipo, status, origem}`                                     |
| `alteracao_doc` | `client_document_events.document_id` | `{actor, details}`                                  |
| `processo`      | `processes.id`              | `{status, advogado, proxima_audiencia}`                     |
| `audiencia`     | `processes.id`              | `{status}`                                                   |

### `search_clients(p_filtros jsonb DEFAULT '{}')`
Retorna `TABLE(id uuid, full_name text, status text, client_origin text, city text,
state text, gov_br_profile text, created_at timestamptz)`, ordenada por `full_name`.
Gate: `is_recepcao_or_socio()` → senão `42501`. **Não retorna `tipo_pessoa`.**

Chaves aceitas (aplica só as presentes; strings de texto usam `ilike`):
- Diretos: `nome`, `email`, `telefone`, `cidade` (ilike); `uf`, `status`, `origem`,
  `tipo_pessoa` (=); `ativo` (bool → status='ativo'/≠'ativo'); `gov` (bool →
  gov_br_profile is/not null); `criado_de`/`criado_ate` (timestamptz).
- `cpf` (string): match **EXATO** por índice cego (`cpf_bidx = pii_bidx(cpf)`).
  Não é parcial — exige o CPF completo.
- Indiretos: `responsavel_id` (uuid → tarefa com `assignee_user_id`), `tem_pendencia`
  (bool), `task_type_id` (uuid), `tem_documento_tipo` (string), `docs_completos`
  (bool, via `client_document_checklist`), `tem_processo` (bool), `tem_audiencia` (bool).
- **Semântica tri-estado dos booleanos:** chave ausente = ignora; `true` = tem;
  `false` = **não tem**. Um checkbox liga/desliga só cobre true/ausente — a UI usa
  seletor tri-estado ("Qualquer / Sim / Não") para expor o caminho `false`.

Chamadas FE: `supabase.rpc('client_timeline', { p_client_id })` e
`supabase.rpc('search_clients', { p_filtros })`. As RPCs não estão nos tipos gerados
do Supabase → seguir o padrão de cast já usado em [Clients.tsx](../../../src/pages/Clients.tsx).

## Card 3.8 — Aba Histórico (timeline unificada)

**Arquivo novo:** `src/components/clients/tabs/historicoTab.tsx` exportando `HistoricoTab`.
Remover a `HistoricoTab` atual de `chatTabs.tsx` (que fica só com `PecasTab`/`AudiosTab`)
e atualizar o import em `ClientDetails.tsx`.

Comportamento:
- Carrega `client_timeline(client.id)` no mount (padrão `useEffect` + `cancelled` já
  usado nas abas).
- Mapa local `EVENT_META: Record<event_type, { icon, label, cls }>` — ícone/rótulo/cor
  de chip por tipo. Ícones no estilo já usado (`✦ ◷ ⚑ ✓ ▤ • ⚖`).
- Lista cronológica (já ordenada desc): por item — ícone, `title`, `formatDateBR(event_at)`
  e uma linha secundária derivada do `extra` por tipo:
  - `processo`: `status · Resp. advogado · Próx. audiência {proxima_audiencia}`
  - `tarefa`/`pendencia`: `status · prioridade · vence {data_fatal}` (+ `pendencia_tipo`)
  - `documento`: `tipo · status · origem`
  - `conversa`: `{mensagens} mensagens · status`
  - `aprovacao`: `Validada`
  - `alteracao_doc`: rótulo do evento
- **Chips de filtro por tipo (client-side):** um chip "Todos" + um por `event_type`
  presente na timeline, com contador; alterna a visibilidade da lista.
- **Link via `ref_id`:** clicar no evento troca a aba ativa do `ClientDetails` usando
  `useSearchParams` dentro da própria aba (sem mudar a assinatura de `TABS`):
  `documento`/`alteracao_doc` → `documentos`; `tarefa`/`aprovacao` → `tarefas`;
  `pendencia` → `pendencias`; `processo`/`audiencia` → `processos`.
  `conversa`: vira link para a sessão só se houver rota de chat existente (confirmar na
  implementação); caso contrário permanece informativo (sem link quebrado).
- **Erro `42501`:** detectar no retorno e mostrar mensagem clara (`EmptyState`/toast).
  O gate de página (`ALLOWED_ROLES`) já barra, mas tratar defensivamente.
- **Vazio honesto** quando a timeline volta vazia.
- Abas sem fonte (Reuniões/Audiências/Protocolos/Áudios) permanecem inalteradas.

## Card 3.9 — Filtros avançados na lista (`Clients.tsx`)

Substituir o carregamento atual (`clients_decrypted` + filtro client-side +
`search_clients_by_cpf`) por `search_clients(p_filtros)`.

- Estado de filtros num objeto; `buildFiltros()` monta o jsonb **incluindo só as chaves
  preenchidas** (string vazia / "todos" / "qualquer" → omite a chave).
- Debounce (~300ms) para disparar o RPC ao mudar filtros de texto.
- Novo tipo `SearchClientRow` com as 8 colunas retornadas. Sem selo "PJ" nas linhas
  (RPC não retorna `tipo_pessoa`); manter Cidade/UF, Cadastro, Status; opcionalmente
  exibir origem.
- **Controles** (painel "Filtros avançados" recolhível; os básicos — nome, status, UF —
  permanecem sempre visíveis):
  - Texto (debounce): `nome`, `cidade`, `email`, `telefone`.
  - **CPF:** campo dedicado com texto de ajuda "CPF completo — busca exata (não parcial)"
    → `p_filtros.cpf`.
  - Selects: `status`, `uf` (STATES), `origem`, `tipo_pessoa`, `responsavel_id`
    (dropdown de usuários — fonte a confirmar: hook de assignees/profiles),
    `task_type_id` (`useTaskTypes`), `tem_documento_tipo` (`DOCUMENT_TYPE_OPTIONS`).
  - Datas: `criado_de` / `criado_ate` (`<input type=date>` → ISO timestamptz;
    `criado_ate` cobre o dia inteiro, fim do dia).
  - Tri-estado ("Qualquer/Sim/Não"): `ativo`, `gov`, `tem_pendencia`, `docs_completos`,
    `tem_processo`, `tem_audiencia`.
- Paginação client-side sobre o resultado (o RPC devolve tudo, ordenado por nome).
- **Erro `42501`** tratado com mensagem clara (não mostrar lista vazia silenciosa).
- Botão "Limpar filtros".

## Filtros salvos — nova tabela `client_saved_filters`

**Migration aditiva** `supabase/migrations/<timestamp>_client_saved_filters.sql`,
espelhando o padrão de `kanban_saved_filters`:
- Tabela: `id uuid pk`, `user_id uuid → auth.users`, `name text`, `filter jsonb`,
  `created_at`, `updated_at`; índice por `user_id`; RLS `FOR ALL` com
  `user_id = auth.uid()`; trigger `update_updated_at_column`.
- RPCs (SECURITY DEFINER/INVOKER conforme o padrão do kanban):
  `get_my_client_saved_filters()`, `client_save_filter(p_name text, p_filter jsonb)`,
  `client_delete_saved_filter(p_id uuid)`.
- **NÃO aplicar** (`db push` proibido; validar/aplicar com o Ryan).

FE:
- Dropdown "Filtros salvos" (aplica o `filter` jsonb ao estado), botão "Salvar filtro
  atual" (pede nome), e excluir.
- **Degradação graciosa:** ao montar, tenta `get_my_client_saved_filters()`; se a função
  ainda não existe no banco (erro de função ausente / não encontrada), esconde a UI de
  filtros salvos. Quando o Ryan aplicar a migration, a UI liga automaticamente.

## Fora de escopo (não tocar)
As 2 RPCs (`client_timeline`, `search_clients`), classificador, fast-path, `save_client`,
gate, storage, e a migration pendente `drop_plaintext_pii`.

## Validação
- Logado como recepção (Kailane): a lista filtra por cada critério — testar um direto
  (`status=ativo` → ~33) e um indireto (`tem_processo` → ~24). Histórico de um cliente
  com processo mostra o evento `processo`.
- CPF: busca exata funciona; parcial não retorna (esperado).
- Usuário sem papel de recepção/sócio → `42501`; FE mostra mensagem clara.
- `npm run lint` e `npm run build` limpos.
