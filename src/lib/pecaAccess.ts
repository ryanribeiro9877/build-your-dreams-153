// Papel autor de peças (role_templates.code): sócio ou advogada(o) (`adv_*`).
//
// Quem CRIA/ANEXA peça é advogado/sócio; recepção só VISUALIZA as peças já
// anexadas (aba Documentos do cliente). Este é o mesmo modelo de papel usado no
// RLS por tipo de documento no backend e em list_meeting_lawyers da Agenda
// (ver useMeetingLawyers) — a fonte é profiles.role_template_id ->
// role_templates.code, exposto no front por useMyWorkspace.
//
// É só a camada visual: o backend já bloqueia o INSERT de peça para recepção
// via RLS. Aqui escondemos os botões que iriam falhar (gerar/salvar/anexar).
export function isPecaAuthor(code: string | null | undefined): boolean {
  const c = code ?? "";
  return c === "socio" || c.startsWith("adv_");
}
