# Resend — e-mails de convite JurisAI

## Por que chegou e-mail do Supabase (inglês)?

Se `RESEND_API_KEY` **não** estiver nos **Secrets** da edge function `invite-employee`, o sistema antigo chamava `inviteUserByEmail` e o Supabase enviava o template padrão (`noreply@mail.app.supabase.io`, link para `localhost:3000`).

Com Resend configurado, o fluxo usa `generateLink` (sem e-mail do Supabase) + envio HTML via Resend para `/definir-senha` com `SITE_URL` correto.

## Variáveis (Edge Functions)

| Variável | Onde | Exemplo | Descrição |
|----------|------|---------|-----------|
| `RESEND_API_KEY` | Edge secret | `re_...` | **Obrigatório** para convites |
| `INVITE_EMAIL_FROM` | Edge secret | `JurisAI <onboarding@resend.dev>` | Remetente |
| `INVITE_EMAIL_REPLY_TO` | Edge secret | opcional | Respostas |
| `SITE_URL` | Edge secret | `http://localhost:8080` | Base do link no e-mail |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Pages (prod) / `.env` (dev) | prod `0x4AAA...` · dev `1x0000...AA` | Widget captcha |
| `TURNSTILE_SECRET_KEY` | Edge secret | prod `0x4A...` · dev `1x0000...AA` | Validação captcha |

## Local (`supabase functions serve`)

Crie `supabase/.env.local` (não vai para o Git):

```env
RESEND_API_KEY=re_sua_chave
INVITE_EMAIL_FROM=JurisAI <onboarding@resend.dev>
SITE_URL=http://localhost:8080
```

## Produção (Supabase)

1. `supabase login`
2. Preencha `supabase/.env.local` (sem BOM UTF-8)
3. `node scripts/set-edge-secrets.mjs`
4. `npx supabase functions deploy invite-employee verify-turnstile --project-ref tsltxvswzdnlmvljpryh`

Ou no Dashboard: **Project Settings → Edge Functions → Secrets** (mesmas chaves).

## Domínio próprio

1. Verifique o domínio no [Resend](https://resend.com/domains).
2. Altere o remetente, por exemplo: `JurisAI <convites@bacellaradvogados.com.br>`.

Enquanto o domínio não estiver verificado, use o sandbox: `JurisAI <onboarding@resend.dev>` (só envia para o e-mail da sua conta Resend em testes).

## Auth

Inclua em **Authentication → URL Configuration → Redirect URLs**:

- `http://localhost:8080/definir-senha`
- `https://seu-dominio.com/definir-senha`
