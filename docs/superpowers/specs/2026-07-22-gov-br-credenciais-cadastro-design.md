# Coleta de credencial GOV.BR no wizard de cadastro de cliente

**Data:** 2026-07-22
**Autor:** Ryan (via Claude)
**Status:** Aprovado (aguardando revisão do spec)

## Problema

Hoje a credencial GOV.BR do cliente (usuário/senha) só pode ser cadastrada
**depois** do cliente existir, na aba "Gov.br" da tela de detalhe
([infoTabs.tsx](../../../src/components/clients/tabs/infoTabs.tsx), `GovBrTab` /
`GovCredForm`). A recepção precisa concluir o cadastro e, em um segundo momento,
abrir o cliente e ir até a aba para guardar o acesso GOV.BR — passo fácil de
esquecer.

O pedido: permitir informar **usuário e senha do GOV.BR já no formulário de
cadastro** (wizard), no mesmo fluxo em que os demais dados são coletados.

## Contexto existente (reuso, não recriação)

O sistema **já tem** um cofre de credenciais GOV.BR auditado. Nada disso será
recriado:

- Tabela `client_gov_credentials` — colunas `_enc` (bytea) cifradas, `tem_2fa`,
  `status_acesso`, `consentimento_*`. Nunca lida por SELECT direto dos `_enc`.
- RPC `save_gov_credential(p_client_id, p_usuario, p_senha, p_tem_2fa,
  p_status_acesso, p_consentimento, p_consentimento_versao)` — `SECURITY
  DEFINER`, cifra server-side, **exige consentimento** (rejeita com `23514` se
  `p_consentimento` for falso).
- RPC `reveal_gov_credential(p_client_id)` — `SECURITY DEFINER`, retorna a senha
  em claro **gravando log de auditoria** (quem/quando).
- Termo de consentimento vigente: `GOV_CONSENT_VERSION = "1.0"`.

A tela de detalhe continua a fonte de verdade para revelar/editar/auditar a
credencial. Este trabalho apenas adiciona um **segundo ponto de entrada** (o
wizard) que grava pela mesma RPC.

## Decisões (alinhadas com o usuário)

1. **Armazenamento:** cifrado reversível, com revelação auditada — exatamente o
   comportamento do cofre existente. (Nenhuma coluna nova, nenhuma mudança em
   `save_client` nem na cifragem.)
2. **Local no wizard:** etapa **Classificação**, logo abaixo do campo
   "Perfil do GOV.BR" já existente.
3. **Obrigatoriedade:** campos **opcionais** — a ausência não bloqueia o
   cadastro (consistente com a regra do projeto: falta de dado vira pendência,
   não trava).
4. **Conjunto de campos:** mínimo — `usuário`, `senha`, `consentimento`.
   `status_acesso` entra como `'pendente'` e `tem_2fa` como `false` por padrão
   (ambos editáveis depois na aba Gov.br).

## Design

### Front — `ClienteFormWizard.tsx`

Estado local novo (não entra em `ClientFormValues`/`save_client`, pois a
credencial trafega por outra RPC):

```ts
const [govUser, setGovUser] = useState("");
const [govPass, setGovPass] = useState("");
const [govConsent, setGovConsent] = useState(false);
```

**`renderClassificacao()`** ganha uma mini-seção após o "Perfil do GOV.BR":

- `Usuário GOV.BR (CPF/login)` — `<input>` texto, `autoComplete="off"`.
- `Senha GOV.BR` — `<input type="password">`, `autoComplete="new-password"`.
- Checkbox de **consentimento**: "O cliente consente com a custódia segura da
  credencial GOV.BR (termo v1.0)." Rótulo deixa claro que é necessário para
  salvar a credencial.
- Texto de apoio: campos opcionais; a senha é cifrada e só revelada com registro
  em auditoria.

**Gravação — `handleConfirm()`**, após `save_client` retornar o `newId` no modo
`create` e antes de exibir a fase de documentos:

```ts
const govUserFilled = govUser.trim() !== "" && govPass !== "";
if (govUserFilled && govConsent) {
  const { error: govErr } = await supabase.rpc("save_gov_credential", {
    p_client_id: id,
    p_usuario: govUser.trim(),
    p_senha: govPass,
    p_consentimento: true,
    p_consentimento_versao: "1.0",
    // p_tem_2fa e p_status_acesso ficam nos defaults (false / 'pendente')
  });
  setGovPass(""); // nunca reter a senha digitada após o envio
  if (govErr) toast.error("Cliente salvo, mas a credencial GOV.BR não pôde ser guardada. Cadastre-a na aba Gov.br.");
  else toast.success("Credencial GOV.BR guardada com segurança.");
} else if (govUserFilled && !govConsent) {
  toast.warning("Cliente cadastrado. A credencial GOV.BR não foi salva: marque o consentimento (na aba Gov.br) para guardá-la.");
}
```

Regras:

- Credencial só é enviada quando **usuário + senha + consentimento** estão
  presentes.
- Falha na credencial é **best-effort**: o cadastro do cliente já foi concluído;
  o erro só gera aviso (mesma filosofia do upload de documentos).
- A senha digitada é limpa do estado (`setGovPass("")`) após o envio; não persiste
  no componente.
- Reset dos três campos junto do restante ao encerrar o fluxo, quando aplicável.

### Backend

**Sem alterações.** `save_gov_credential` e `reveal_gov_credential` já existem,
são `SECURITY DEFINER` e já barram papéis sem permissão (`42501`). A tela de
cadastro é alcançável apenas pela recepção (gate `canAccessClients`).

### Edição (`mode === "edit"`)

Fora de escopo nesta primeira entrega: a edição da credencial permanece na aba
Gov.br (que já trata preservação de senha em branco). A mini-seção do wizard
aparece apenas no `mode === "create"`, evitando confusão de "senha em branco
apaga?" no update. (Decisão a confirmar na revisão.)

## Isolamento e testabilidade

- A lógica de "quando enviar a credencial" é uma condição pura
  (`usuário && senha && consentimento`) — extraível para um helper testável
  (ex.: `shouldSaveGovCredential(user, pass, consent)`), coberto por teste
  unitário sem rede, no mesmo espírito de `clientDocuments.ts`.
- A chamada de rede (`save_gov_credential`) fica isolada no `handleConfirm`; o
  helper decide, o handler executa.

## Fora de escopo

- Alterar a aba Gov.br, a cifragem, as RPCs ou a tabela.
- Coletar 2FA/status/seed TOTP no wizard (segue só na aba).
- Editar credencial pelo wizard no modo edição.

## Critérios de aceite

1. No cadastro (create), a etapa Classificação mostra os campos de acesso GOV.BR
   abaixo do Perfil do GOV.BR.
2. Preenchendo usuário + senha + consentimento e concluindo o cadastro, a
   credencial aparece na aba Gov.br do cliente (status "pendente", sem 2FA) e é
   revelável por `reveal_gov_credential`.
3. Preenchendo usuário/senha **sem** consentimento, o cliente é cadastrado e um
   aviso informa que a credencial não foi salva.
4. Sem preencher nada de GOV.BR, o cadastro conclui como hoje, sem tocar em
   `client_gov_credentials`.
5. `tsc --noEmit` limpo; teste unitário do helper de decisão passando.
