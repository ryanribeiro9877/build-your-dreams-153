# Relatório Técnico — Consolidação do Menu Configurações

**Data:** 2026-07-02
**Branch:** `claude/settings-menu-consolidation-pgx79u`
**Escopo:** Consolidar os acessos de *Listar usuários*, *Criar usuários* e *Meus tokens* dentro do menu de Configurações (seção **Sistema** da barra lateral), removendo-os de qualquer outra parte da UI.

---

## 1. Objetivo

Centralizar três funcionalidades que estavam dispersas pela interface dentro de um único ponto de acesso — o menu lateral (seção **Sistema**), que funciona como o menu de configurações do sistema:

| Funcionalidade | Regra de visibilidade |
|---|---|
| Listar Usuários | **Somente admin** |
| Criar Usuário | **Somente admin** |
| Meus Tokens | Todos os usuários autenticados |

Requisito de negócio: listar e criar usuários são tarefas exclusivas do administrador, portanto passam a aparecer **apenas para o usuário admin**. Após a inclusão no menu, os acessos antigos (fora do menu) foram removidos, deixando **apenas** o acesso via menu.

---

## 2. Situação anterior (antes da mudança)

Não existia um menu de Configurações consolidado. Os acessos estavam espalhados por duas superfícies:

### 2.1 Barra superior — `src/components/juris-cloud/JurisTopBar.tsx`
- Botão **"Criar Funcionário"** → abria o modal de criação (`openCreateEmployee`) — visível por `isMaster`.
- Botão **"Ver Lista"** → `navigate("/admin/funcionarios")` — visível por `isMaster`.
- **Chip de tokens** (moeda + saldo) → `navigate("/tokens")` — visível para todos.

### 2.2 Painel de Administração — `src/pages/Admin.tsx`
- Botão **"Criar Funcionário"** → `navigate("/sistema?criar=funcionario")` — dentro do bloco `isMaster`.
- Botão **"Ver Lista"** → `navigate("/admin/funcionarios")` — dentro do bloco `isMaster`.

> Observação: o gate anterior usava `isMaster` (que abrange admin **OU** director **OU** sócio **OU** RPC `is_master_admin`). O novo requisito restringe listar/criar usuários a **admin apenas**.

---

## 3. Mudanças realizadas

### 3.1 `src/components/JurisCloudOS.tsx` — adição dos itens ao menu

Foram adicionados três itens ao array `MENU_ITEMS` (renderizado na seção **Sistema** da barra lateral):

```tsx
{ id: "usuarios-listar", label: "Listar Usuários", icon: Users,    color: ACCENT_SOFT, action: () => navigate("/admin/funcionarios"), show: canAccessAdmin },
{ id: "usuarios-criar",  label: "Criar Usuário",   icon: UserPlus, color: ACCENT,      action: () => openCreateEmployee(),          show: canAccessAdmin },
{ id: "tokens",          label: "Meus Tokens",     icon: Coins,    color: ACCENT,      action: () => navigate("/tokens"),           show: true },
```

- **Listar Usuários** e **Criar Usuário** — posicionados logo após o item "Administração"; gate `canAccessAdmin` (`primaryRole === "admin"`), portanto **visíveis somente ao admin**.
- **Meus Tokens** — posicionado antes de "Meu Perfil"; `show: true`, visível a todos os usuários autenticados.

Ajustes de suporte no mesmo arquivo:
- **Imports de ícones:** adicionados `UserPlus` e `Coins` ao import de `lucide-react`.
- **Remoção de código sem uso:** o hook `useMasterAdmin` deixou de ser utilizado neste componente (só servia para passar `isMaster` à barra superior). Foram removidos:
  - o import `import { useMasterAdmin } from "@/hooks/useMasterAdmin";`
  - a linha `const { isMaster } = useMasterAdmin();`
  - as props `isMaster`, `openCreateEmployee` e `tokenBalance` que eram passadas ao `JurisTopBar`.

> `openCreateEmployee` continua existindo no componente, pois agora é acionado pelo item de menu "Criar Usuário". O modal de criação (`CreateEmployee`, aberto via `?criar=funcionario`) permanece intacto.

### 3.2 `src/components/juris-cloud/JurisTopBar.tsx` — remoção dos acessos antigos

- Removido o bloco `isMaster` inteiro, que continha os botões **"Criar Funcionário"** e **"Ver Lista"**.
- Removido o **chip de tokens** (botão com ícone de moeda e saldo) que navegava para `/tokens`.
- Limpeza da interface e assinatura do componente:
  - Props removidas de `JurisTopBarProps` e da desestruturação: `isMaster`, `openCreateEmployee`, `tokenBalance`.
- Limpeza de imports que ficaram sem uso:
  - Ícones: `Coins`, `UserPlus`, `Users`, `Lock`.
  - Tipos/constantes: `LucideIcon`, `Agent`, `SidebarItem`, `ACCENT`, `ACCENT_SOFT`.
  - Config: `BILLING_ENABLED`, `UNLIMITED_LABEL` (só eram usados pelo chip de tokens).

Permanecem na barra superior: Validar, Tarefas, Kanban, Central de Notificações e o chip de usuário/perfil.

### 3.3 `src/pages/Admin.tsx` — remoção dos acessos antigos

- Removido o bloco `isMaster` que renderizava os botões **"Criar Funcionário"** e **"Ver Lista"**.
- O hook `useMasterAdmin`/`isMaster` **permanece** no arquivo, pois ainda é usado no guarda de acesso da página (`if (!canAccessAdmin && !isMaster) navigate("/sistema")`).
- Os demais atalhos do Painel de Administração (Dashboard de Tokens, Histórico de avisos, Eventos de UI, Agentes IA) permanecem inalterados.

---

## 4. Decisões de projeto

1. **Menu de Configurações = seção "Sistema" da barra lateral.** É o único menu consolidado de itens de sistema/configuração no app (onde já viviam Administração, Providers, Meu Perfil, Sair). Os novos itens foram adicionados nele.

2. **Gate de admin (`canAccessAdmin`).** O requisito explicita que listar/criar usuários são tarefas exclusivas do admin e devem aparecer **apenas para o admin**. Por isso adotou-se `canAccessAdmin` (`primaryRole === "admin"`), consistente com o gate do item "Administração".
   - **Impacto de comportamento:** anteriormente esses acessos usavam `isMaster` (admin/director/sócio). Com a mudança, **directores e sócios deixam de ver** os acessos de listar/criar usuários na UI, conforme solicitado. As rotas de destino (`/admin/funcionarios`, guardada por `AdminRoute`) continuam com suas próprias regras de servidor/rota — a mudança aqui é de **visibilidade na UI**.

3. **Meus Tokens sem gate.** Mantida a política anterior (visível a todos os autenticados); apenas o ponto de acesso mudou do chip da barra superior para o item de menu.

4. **Nenhuma rota nova.** Todas as rotas de destino já existiam (`/admin/funcionarios`, `/tokens`, e o modal `?criar=funcionario`). Não houve alteração em `App.tsx` nem nos guardas de rota.

---

## 5. Arquivos alterados

| Arquivo | Natureza da mudança |
|---|---|
| `src/components/JurisCloudOS.tsx` | +3 itens no `MENU_ITEMS`; +imports `UserPlus`, `Coins`; remoção de `useMasterAdmin`/`isMaster` e das props enviadas ao `JurisTopBar` |
| `src/components/juris-cloud/JurisTopBar.tsx` | Remoção dos botões Criar/Listar e do chip de tokens; limpeza de props e imports |
| `src/pages/Admin.tsx` | Remoção do bloco de botões Criar Funcionário / Ver Lista |
| `docs/relatorio-consolidacao-menu-configuracoes.md` | Este relatório |

---

## 6. Verificação

- **Build de produção:** `npm run build` — **concluído com sucesso** (✓ built).
- **Lint (`eslint`) nos arquivos alterados:** sem novos erros introduzidos. Os únicos apontamentos são pré-existentes (`@typescript-eslint/no-explicit-any` e `react-hooks/exhaustive-deps`) em linhas não relacionadas às mudanças (~590–863 de `JurisCloudOS.tsx`).
- Sem variáveis/imports órfãos introduzidos pelas remoções.

---

## 7. Comportamento resultante (resumo)

- **Usuário admin:** vê no menu lateral (Sistema) — *Listar Usuários*, *Criar Usuário* e *Meus Tokens*, além dos itens já existentes.
- **Demais usuários:** veem apenas *Meus Tokens* (e os itens permitidos ao seu papel); não veem os acessos de gestão de usuários.
- **Barra superior:** não exibe mais os botões de criar/listar funcionário nem o chip de tokens.
- **Painel de Administração:** não exibe mais os botões de criar/listar funcionário (mantém os demais atalhos administrativos).
