import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const initialized = useRef(false);
  const deadlineInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;

    // Listen for new clients
    const clientsChannel = supabase
      .channel("notify_clients")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clients" }, (payload) => {
        const client = payload.new as { full_name: string };
        toast.info(` Novo cliente cadastrado: ${client.full_name}`, { duration: 5000 });
      })
      .subscribe();

    // Listen for new documents
    const docsChannel = supabase
      .channel("notify_documents")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_documents" }, (payload) => {
        const doc = payload.new as { document_name: string; document_type: string };
        toast.info(` Novo documento: ${doc.document_name} (${doc.document_type})`, { duration: 5000 });
      })
      .subscribe();

    // Listen for critical tasks created
    const tasksChannel = supabase
      .channel("notify_critical_tasks")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_tasks" }, (payload) => {
        const task = payload.new as { title: string; priority: string; client_name?: string };
        if (task.priority === "critical") {
          toast.error(` TAREFA CRÍTICA: ${task.title}${task.client_name ? ` — ${task.client_name}` : ""}`, {
            duration: 10000,
          });
        } else if (task.priority === "high") {
          toast.warning(`️ Tarefa alta prioridade: ${task.title}`, { duration: 7000 });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agent_tasks" }, (payload) => {
        const task = payload.new as { title: string; priority: string; status: string };
        if (task.priority === "critical" && task.status === "completed") {
          toast.success(` Tarefa crítica concluída: ${task.title}`, { duration: 5000 });
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
