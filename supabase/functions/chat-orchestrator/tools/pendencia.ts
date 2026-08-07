/* ============================================================
   Conclusão de pendência/tarefa genérica pelo chat (item 6 de 06/08)
   ============================================================
   Pela TELA, `✔ Concluir` funciona em qualquer tipo de tarefa. Pelo CHAT não
   havia caminho: o mapa do reteste marcou "Tarefa/pendência genérica → SEM-TOOL".

   O que os corpos das RPCs (lidos de pg_get_functiondef em 07/08/2026) dizem, e
   que é a razão de este arquivo existir:

   - `resolver_pendencia(p_id, p_resolucao)` — CORRETO para pendência: confere
     `pode_operar_pendencia`, grava os TRÊS campos (`status`, `pendencia_estado`,
     `completed_at`), audita em `task_audit_log` e, quando a pendência veio de
     OUTRO departamento, DEVOLVE para a origem em vez de encerrar.
   - `update_user_task_status(...,'completed',...)` — é o que a tela usa no
     `✔ Concluir`; grava `status` + `completed_at`, e é o caminho certo para
     tarefa que NÃO é pendência.
   - `atualizar_tarefa(p_status => 'concluída')` — a tool que o chat já tinha.
     Grava SÓ `status`: não toca `pendencia_estado` NEM `completed_at`. É o bug
     de 05/08 ("fechar só um campo deixa a pendência viva na tela"), aqui em
     forma latente. Por isso o handler desvia o pedido de conclusão para cá.
   - `_fechar_pendencia(p_task_id, p_motivo)` — o briefing pediu esta, mas ela
     NÃO confere permissão nenhuma (é helper interno, prefixo `_`, chamado de
     dentro de RPCs que já checaram). Exposta a uma tool, qualquer usuário
     fecharia pendência alheia por id. Usamos `resolver_pendencia`, que faz o
     mesmo e mais, COM o guard.

   Aqui fica só o que pode errar sem banco: reconhecer o pedido de conclusão,
   decidir se dá para concluir, e contar o que REALMENTE ficou gravado.
============================================================ */

const MARCAS_COMBINANTES = new RegExp("[\\u0300-\\u036f]", "g");
function fold(s: string): string {
  return s.normalize("NFD").replace(MARCAS_COMBINANTES, "").toLowerCase().trim();
}

/**
 * Sinônimos de "concluída" — espelho exato do CASE de `atualizar_tarefa` que
 * resolve para `completed`. Se o usuário disser qualquer um deles, a conclusão
 * tem de passar pelo caminho que fecha os três campos, não pelo que fecha um.
 */
const STATUS_DE_CONCLUSAO = new Set([
  "completed", "concluida", "concluido", "finalizada", "feita", "pronta", "concluir",
]);

export function statusPedeConclusao(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s ? STATUS_DE_CONCLUSAO.has(fold(s)) : false;
}

/** Recorte de `user_tasks` que a conclusão precisa ler antes e depois. */
export interface TarefaAlvo {
  title?: string | null;
  status?: string | null;
  is_pendencia?: boolean | null;
  pendencia_estado?: string | null;
  origem_departamento?: string | null;
  departamento_atual?: string | null;
}

/** `recepcao_supervisionada` → "recepcao supervisionada" (org_stage é snake_case). */
function legivel(v: unknown): string {
  return String(v ?? "").replace(/_/g, " ").trim();
}

/**
 * Por que NÃO dá para concluir — mensagem pronta para o usuário; `null` libera.
 * Concluir o que já está concluído devolveria "pronto!" sem nada ter mudado:
 * é a família do órfão de storage (o usuário acredita que o sistema agiu).
 */
export function motivoParaNaoConcluir(t: TarefaAlvo | null | undefined): string | null {
  if (!t) {
    return "não achei essa tarefa (ou ela não é sua) — nada foi concluído. "
      + "Localize-a com consultar_tarefas antes de concluir.";
  }
  const st = String(t.status ?? "");
  const nome = String(t.title ?? "").trim();
  const qual = nome ? `"${nome}"` : "essa tarefa";
  if (st === "completed") return `${qual} JÁ está concluída — nada foi alterado.`;
  if (st === "cancelled") return `${qual} foi CANCELADA, e tarefa cancelada não se conclui — nada foi alterado.`;
  return null;
}

/**
 * O que REALMENTE ficou gravado, lido do estado posterior à chamada — nunca a
 * promessa feita antes dela. É o padrão que o reteste de 06/08 registrou como a
 * primeira promessa cumprida do sistema (o lembrete de audiência): o cartão
 * promete, e o resultado confirma ou desmente.
 */
export function notasConclusao(antes: TarefaAlvo, depois: TarefaAlvo | null | undefined): string[] {
  const notas: string[] = [];
  if (!depois) {
    notas.push(
      "A gravação foi aceita, mas não consegui reler a tarefa para confirmar o "
      + "estado final — confira em Tarefas antes de considerar encerrada.",
    );
    return notas;
  }

  const st = String(depois.status ?? "");
  if (st === "awaiting_validation") {
    notas.push(
      "ATENÇÃO: esta tarefa NÃO ficou concluída — o tipo dela exige validação, "
      + "então ela foi para AGUARDANDO VALIDAÇÃO e só encerra quando quem valida aprovar.",
    );
  } else if (st !== "completed") {
    notas.push(
      `ATENÇÃO: o banco NÃO registrou a conclusão — o status continua "${legivel(st) || "desconhecido"}". `
      + "A tarefa segue aberta na tela; não diga ao usuário que ela foi encerrada.",
    );
    return notas;
  }

  if (antes.is_pendencia === true) {
    const estado = String(depois.pendencia_estado ?? "");
    if (estado === "devolvida") {
      const dep = legivel(depois.departamento_atual ?? antes.origem_departamento);
      notas.push(
        `Esta pendência veio de outro setor, então foi resolvida e DEVOLVIDA${dep ? ` para ${dep}` : " para a origem"}: `
        + "ela sai da sua fila e volta para quem abriu — não desaparece do sistema, e quem abriu foi notificado.",
      );
    } else if (estado === "resolvida") {
      notas.push("Pendência marcada como resolvida — sai da fila de pendências abertas.");
    } else {
      notas.push(
        `ATENÇÃO: o status foi para concluído, mas o estado da pendência continua "${legivel(estado) || "vazio"}" — `
        + "ela pode continuar aparecendo como aberta na tela. Avise que a baixa ficou pela metade.",
      );
    }
  }

  // Item 7.2 de 06/08 (3ª ocorrência): pendência mora em TAREFAS. Mandar o
  // usuário conferir "no Kanban" — que é a esteira de CASO distribuído — já
  // gerou alarme de perda de dado que não existia.
  notas.push("A baixa aparece em Tarefas (não no Kanban, que é a esteira de casos distribuídos).");
  return notas;
}
