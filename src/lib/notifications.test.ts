import { describe, expect, it, vi } from "vitest";

// notifications.ts importa o client do Supabase no topo; sem VITE_SUPABASE_URL
// (ambiente de teste/CI) o createClient lança "supabaseUrl is required." na carga
// do módulo. O resolver é puro, então stubamos o client (mesmo padrão de
// clientDocuments.test.ts).
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { resolveNotificationRoute } from "./notifications";

describe("resolveNotificationRoute", () => {
  it("normaliza a rota legada /kanban do trigger para a inbox real", () => {
    // Antes da migration fix_notification_routes_kanban_agenda, o trigger
    // trg_notify_task_assignment gravava '/kanban' (inexistente no App.tsx →
    // NotFound). Origem já corrigida; este mapa é defesa em profundidade.
    expect(resolveNotificationRoute({ route: "/kanban" })).toBe("/sistema/tarefas");
  });

  it("normaliza /tarefas legado para /sistema/tarefas", () => {
    expect(resolveNotificationRoute({ route: "/tarefas" })).toBe("/sistema/tarefas");
  });

  it("normaliza /agenda legado (supervisor_check_atendimentos) para /sistema/agenda", () => {
    expect(resolveNotificationRoute({ route: "/agenda" })).toBe("/sistema/agenda");
  });

  it("preserva uma rota já válida do App.tsx", () => {
    expect(resolveNotificationRoute({ route: "/sistema/tarefas" })).toBe("/sistema/tarefas");
    expect(resolveNotificationRoute({ route: "/sistema/agenda" })).toBe("/sistema/agenda");
    expect(resolveNotificationRoute({ route: "/sistema/equipe" })).toBe("/sistema/equipe");
  });

  it("retorna null quando não há rota (não navega)", () => {
    expect(resolveNotificationRoute({ route: null })).toBeNull();
    expect(resolveNotificationRoute({ route: "" })).toBeNull();
    expect(resolveNotificationRoute({ route: "   " })).toBeNull();
  });
});
