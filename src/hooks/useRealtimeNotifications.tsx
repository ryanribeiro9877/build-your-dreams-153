import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/** Runtime guard: returns true if value is a non-null object with the given string keys. */
function hasStringFields<K extends string>(
  value: unknown,
  ...keys: K[]
): value is Record<K, string> {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return keys.every((k) => typeof obj[k] === "string");
}

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const deadlineInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Listen for new clients
    const clientsChannel = supabase
      .channel("notify_clients")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clients" }, (payload) => {
        if (hasStringFields(payload.new, "full_name")) {
          toast.info(` Novo cliente cadastrado: ${payload.new.full_name}`, { duration: 5000 });
        }
      })
      .subscribe();

    // Listen for new documents
    const docsChannel = supabase
      .channel("notify_documents")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_documents" }, (payload) => {
        if (hasStringFields(payload.new, "document_name", "document_type")) {
          toast.info(` Novo documento: ${payload.new.document_name} (${payload.new.document_type})`, { duration: 5000 });
        }
      })
      .subscribe();

    // Listen for critical tasks created
    const tasksChannel = supabase
      .channel("notify_critical_tasks")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_tasks" }, (payload) => {
        if (hasStringFields(payload.new, "title", "priority")) {
          const task = payload.new as { title: string; priority: string; client_name?: string };
          const clientSuffix = typeof task.client_name === "string" ? ` — ${task.client_name}` : "";
          if (task.priority === "critical") {
            toast.error(` TAREFA CRÍTICA: ${task.title}${clientSuffix}`, { duration: 10000 });
          } else if (task.priority === "high") {
            toast.warning(`️ Tarefa alta prioridade: ${task.title}`, { duration: 7000 });
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agent_tasks" }, (payload) => {
        if (hasStringFields(payload.new, "title", "priority", "status")) {
          const task = payload.new;
          if (task.priority === "critical" && task.status === "completed") {
            toast.success(` Tarefa crítica concluída: ${task.title}`, { duration: 5000 });
          }
        }
      })
      .subscribe();

    // Check for approaching deadlines every 60 seconds
    const checkDeadlines = async () => {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const { data } = await supabase
        .from("agent_tasks")
        .select("title, due_date, priority, client_name")
        .eq("user_id", user.id)
        .not("status", "in", '("completed","cancelled")')
        .not("due_date", "is", null)
        .lte("due_date", in24h.toISOString())
        .gte("due_date", now.toISOString());

      if (data && data.length > 0) {
        data.forEach((task) => {
          const dueDate = new Date(task.due_date!);
          const hoursLeft = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));
          const label = hoursLeft <= 1 ? " URGENTE" : ` ${hoursLeft}h restantes`;
          toast.warning(`${label}: ${task.title}${task.client_name ? ` — ${task.client_name}` : ""}`, {
            duration: 8000,
            id: `deadline-${task.title}`,
          });
        });
      }
    };

    // Initial check + interval
    checkDeadlines();
    deadlineInterval.current = setInterval(checkDeadlines, 60000);

    return () => {
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(docsChannel);
      supabase.removeChannel(tasksChannel);
      if (deadlineInterval.current) clearInterval(deadlineInterval.current);
    };
  }, [user]);
}
