/** Template de convite JurisAI — Resend (HTML + texto) */

export function buildInviteEmailSubject(): string {
  return "JurisAI — Convite para acessar o sistema";
}

export function buildInviteEmailHtml(
  fullName: string,
  roleName: string,
  actionLink: string,
): string {
  const safeName = escapeHtml(fullName);
  const safeRole = escapeHtml(roleName);
  const safeLink = escapeHtml(actionLink);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>JurisAI — Convite</title>
</head>
<body style="margin:0;padding:0;background:#09090f;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#11111a;border:1px solid #25253a;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(145deg,#eab308 0%,#ca9a06 100%);padding:20px 28px;">
              <span style="font-size:24px;font-weight:700;color:#0a0a12;letter-spacing:0.04em;">JurisAI</span>
              <div style="font-size:12px;color:#0a0a12;opacity:0.85;margin-top:4px;">Sua força de trabalho de IA jurídica</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#eeeef5;">Olá, ${safeName}</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#c4c4d4;">
                Você foi convidado(a) para integrar a equipe no <strong style="color:#facc15;">JurisAI</strong>
                com a função de <strong style="color:#facc15;">${safeRole}</strong>.
              </p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#c4c4d4;">
                Para o primeiro acesso, defina sua senha pessoal. Por segurança (LGPD), ela deve ter no mínimo
                8 caracteres, incluindo uma letra maiúscula, um número e um caractere especial.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${safeLink}"
                       style="display:inline-block;padding:14px 32px;background:linear-gradient(145deg,#eab308,#facc15);color:#0a0a12;text-decoration:none;font-weight:700;font-size:15px;border-radius:10px;">
                      Definir minha senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;color:#7a7a92;line-height:1.5;">
                Se o botão não abrir, copie e cole este link no navegador:
              </p>
              <p style="margin:0 0 20px;font-size:11px;color:#9898b0;word-break:break-all;line-height:1.5;">
                <a href="${safeLink}" style="color:#eab308;">${safeLink}</a>
              </p>
              <p style="margin:0;font-size:11px;color:#5a5a72;line-height:1.5;">
                Este link é pessoal e expira em 7 dias. Se você não esperava este convite, ignore este e-mail
                ou fale com o administrador do escritório.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #25253a;background:#0d0d14;">
              <p style="margin:0;font-size:11px;color:#5a5a72;text-align:center;">
                © JurisAI — Bacellar Advogados · Mensagem automática, não responda diretamente a este endereço.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildInviteEmailText(
  fullName: string,
  roleName: string,
  actionLink: string,
): string {
  return `JurisAI — Convite para acessar o sistema

Olá, ${fullName},

Você foi convidado(a) para acessar o JurisAI como ${roleName}.

Defina sua senha de acesso pelo link abaixo (válido por 7 dias):
${actionLink}

Requisitos da senha (LGPD):
- Mínimo de 8 caracteres
- Pelo menos uma letra maiúscula
- Pelo menos um número
- Pelo menos um caractere especial

Se você não esperava este convite, ignore este e-mail.

— JurisAI
Sua força de trabalho de IA jurídica`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getInviteEmailFrom(): string {
  return Deno.env.get("INVITE_EMAIL_FROM")?.trim() || "JurisAI <onboarding@resend.dev>";
}

export function getInviteEmailReplyTo(): string | undefined {
  const reply = Deno.env.get("INVITE_EMAIL_REPLY_TO")?.trim();
  return reply || undefined;
}
