// Lógica pura do card "🎂 Aniversariantes do dia" (recepção).
// Isolada da UI para ser testável: normalização de telefone (DDI 55),
// montagem do link wa.me / tel: e renderização da mensagem de parabéns.
//
// A fonte de dados é a RPC `aniversariantes_do_dia()` (SECURITY DEFINER, gated
// por is_recepcao() no banco), que já devolve o dia certo, exclui is_test e
// calcula a idade. Aqui só cuidamos da apresentação/links.

/** Linha retornada por aniversariantes_do_dia(). */
export interface Aniversariante {
  client_id: string;
  nome: string;
  telefone: string | null;
  is_whatsapp: boolean;
  idade: number;
  data_nascimento: string; // ISO (date)
}

/**
 * Mensagem sugerida de parabéns. `{nome}` é substituído pelo PRIMEIRO nome do
 * cliente. É o padrão editável na UI (a recepção pode ajustar antes de enviar)
 * e o ponto único de configuração do texto.
 */
export const DEFAULT_BIRTHDAY_TEMPLATE =
  "Olá, {nome}! 🎉 A equipe do Bacellar Advogados deseja um feliz aniversário!";

/** Primeiro nome (para a saudação). Tolera espaços extras e string vazia. */
export function primeiroNome(nome: string): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Só os dígitos de um telefone ("(31) 99999-8888" → "31999998888"). */
export function apenasDigitos(telefone: string | null | undefined): string {
  return (telefone ?? "").replace(/\D/g, "");
}

/**
 * Número no formato E.164 do Brasil (só dígitos, com DDI 55) para o wa.me.
 * Não duplica o 55 quando o número já vem com o DDI: um número BR completo
 * (55 + DDD com 2 + assinante com 8/9) tem 12–13 dígitos; abaixo disso
 * assumimos que falta o DDI e o prefixamos.
 */
export function telefoneBR(telefone: string | null | undefined): string {
  const d = apenasDigitos(telefone);
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  return `55${d}`;
}

/** Substitui {nome} pelo primeiro nome do cliente na mensagem-template. */
export function renderBirthdayMessage(template: string, nome: string): string {
  return (template ?? "").replace(/\{nome\}/g, primeiroNome(nome));
}

/**
 * Link do WhatsApp com a mensagem pré-preenchida (NÃO envia sozinho — abre o
 * WhatsApp com o texto no campo; quem envia é a recepção).
 */
export function waMeUrl(telefone: string | null | undefined, mensagem: string): string {
  return `https://wa.me/${telefoneBR(telefone)}?text=${encodeURIComponent(mensagem)}`;
}

/** Link de discagem (para quem não tem WhatsApp). Vazio → "tel:" inócuo. */
export function telHref(telefone: string | null | undefined): string {
  const num = telefoneBR(telefone);
  return num ? `tel:+${num}` : "tel:";
}
