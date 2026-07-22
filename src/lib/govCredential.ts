// src/lib/govCredential.ts
//
// Coleta da credencial GOV.BR (usuário/senha) no wizard de cadastro de cliente.
// A gravação em si NÃO acontece aqui — ela reusa a RPC auditada existente
// `save_gov_credential` (cifra server-side, senha só revelada por
// `reveal_gov_credential` com log). Este módulo só decide, de forma pura e
// testável, O QUE fazer com o que a recepção digitou no wizard.
//
// Regras (spec 2026-07-22):
//  - a credencial só é enviada quando usuário E senha E consentimento estão
//    presentes (o backend rejeita sem consentimento — erro 23514);
//  - usuário + senha preenchidos sem consentimento → avisar (não trava o
//    cadastro do cliente, que já foi concluído);
//  - qualquer preenchimento incompleto (nada, ou só um dos dois) → não faz nada.

export type GovCredDecision = "save" | "missing-consent" | "skip";

// A senha NÃO sofre trim (espaços podem ser significativos); o usuário sim.
export function decideGovCredential(usuario: string, senha: string, consent: boolean): GovCredDecision {
  const filled = usuario.trim() !== "" && senha !== "";
  if (!filled) return "skip";
  return consent ? "save" : "missing-consent";
}
