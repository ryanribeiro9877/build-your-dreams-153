# ASSIGNABLE-USERS-DROPDOWN (FE) — fonte de usuários atribuíveis

> Data: 2026-07-08 · Escopo: **front-end apenas** (nenhuma migration).
> A RPC `list_assignable_users()` **já existe e está aplicada no banco** — não
> recriar, não gerar migration, não rodar `db push`. Esta spec é só a camada FE
> que a consome.

## Problema

O RLS de `public.profiles` só permite: admin vê todos; usuário comum vê apenas a
própria linha (policy `auth.uid() = user_id`, definida em
[migration base](../../../supabase/migrations/20260412205421_b989c9c4-8a98-490f-8d05-fd6f65a9f19f.sql)).

Consequência: qualquer dropdown/lista de "pessoas" populado com
`supabase.from("profiles").select("user_id, full_name, display_name")` fica
**vazio (só o próprio usuário)** para recepção/sócio não-admin. Hoje isso afeta
o [KanbanBoard.tsx](../../../src/pages/KanbanBoard.tsx) (opções de menção/responsável
no detalhe-hub) e afetaria o futuro dropdown "Responsável" dos filtros avançados
de clientes (Card 3.9, ainda não implementado).

## Backend — já pronto no banco (referência, não criar)

```sql
-- JÁ APLICADA NO BANCO. Reproduzida aqui só como contrato.
create or replace function public.list_assignable_users()
returns table (user_id uuid, name text, role_label text)
language sql stable security definer set search_path = ''
as $$
  -- gate real: is_recepcao_or_socio() dentro da função (consistente com
  -- client_timeline / search_clients). grant to authenticated existe, mas a
  -- checagem de papel é a proteção efetiva.
  select p.user_id,
         coalesce(nullif(btrim(p.full_name),''), nullif(btrim(p.display_name),''), 'Sem nome') as name,
         rt.display_name as role_label
    from public.profiles p
    left join public.role_templates rt on rt.id = p.role_template_id
   where p.user_id is not null
     and (rt.id is null or rt.has_login is not false)  -- exclui papéis sem login
   order by name;
$$;
```

- Retorna **empregados logáveis** (`has_login` ≠ false, ou perfil sem template).
- `SECURITY DEFINER` contorna o RLS de `profiles`.
- Gate `is_recepcao_or_socio()`: chamadas por outros papéis retornam erro (`42501`).
- Não está nos tipos gerados do Supabase → consumir com o padrão de cast já usado
  em [Clients.tsx](../../../src/pages/Clients.tsx).

## FE — hook compartilhado `src/hooks/useAssignableUsers.ts`

Novo arquivo. Encapsula a chamada + fallback.

```ts
export interface AssignableUser {
  user_id: string;
  name: string;
  role_label: string | null;
}
// useAssignableUsers(): { users: AssignableUser[]; loading: boolean; error: string | null }
```

Comportamento:
1. Ao montar, chama `supabase.rpc('list_assignable_users')` (via cast — RPC fora
   dos tipos gerados).
2. **Fallback em QUALQUER erro** da RPC (função ausente OU `42501` para papéis fora
   de recepção/sócio): refaz com a query direta
   `supabase.from("profiles").select("user_id, full_name, display_name")` e mapeia
   para `AssignableUser` (`name = full_name || display_name || "Sem nome"`,
   `role_label = null`). Assim:
   - recepção/sócio → roster completo (via RPC);
   - demais papéis → mesmo comportamento de hoje (self; admin vê todos pela RLS);
   - **zero regressão** em relação ao estado atual.
3. Lista ordenada por `name` (pt-BR), sem duplicatas, filtrando `user_id` vazio.
4. Expõe `error` só quando **ambos** (RPC e fallback) falham — erro esperado da RPC
   não vira erro visível ao usuário.

## Consumidor — `KanbanBoard.tsx`

Substituir o bloco que carrega `memberOptions` a partir de `profiles`
([linhas ~90-102](../../../src/pages/KanbanBoard.tsx)) pelo hook:

- Usar `useAssignableUsers()` e mapear `AssignableUser` → `GrantOption`
  (`{ user_id, full_name: name }`).
- **Manter** a query de `role_templates` (opções de cargo do modal de config, admin)
  no `useEffect` atual — o hook cobre só as pessoas.
- `people` (menção/responsável no detalhe-hub) continua derivando de `memberOptions`.

## Fora de escopo (não tocar)
- Card 3.9 / `ClientFiltersPanel` / FE de `search_clients` (não existem ainda; o hook
  fica pronto para quando forem construídos).
- `useEmployeeRoster` (também consulta `profiles` direto e tem a mesma limitação;
  pode adotar o hook depois — fora deste escopo para manter a mudança pequena).
- Qualquer alteração de banco.

## Validação
- Logado como recepção/sócio: no Kanban, o seletor de responsável/menção do detalhe
  lista **todos** os empregados logáveis (não só o próprio usuário).
- Logado como papel fora de recepção/sócio: comportamento idêntico ao atual (sem
  erro visível; fallback silencioso).
- `npm run lint` e `npm run build` limpos.
