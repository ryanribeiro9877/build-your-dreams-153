import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { isMuted, getGroupSize, passesUrgencyFilter } from "@/lib/notificationPrefs";

interface BottleneckAlert {
  type: "overload" | "deadline" | "stalled" | "cost" | "marketing";
  severity: "critical" | "warning" | "info";
  department: string;
  message: string;
  agentName?: string;
}

const DEPT_LABELS: Record<string, string> = {
  recepcao: "Recepção", marketing: "Marketing", civel: "Contencioso Cível",
  trabalhista: "Cont. Trabalhista", tributario: "Cont. Tributário",
  protocolo: "Protocolo", calculos: "Cálculos", audiencias: "Audiências",
  monitoramento: "Monitoramento", financeiro: "Financeiro", compliance: "Compliance",
  familia: "Família", conversao: "Conversão", criacao: "Criação", tech: "Tech",
  eficiencia: "Eficiência", cobrancas: "Cobranças",
};

function openEfficiency() {
  if (typeof window !== "undefined") window.location.assign("/eficiencia");
}

export function useBottleneckDetection() {
  const { user } = useAuth();
  const initialized = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;

    const saveNotification = async (alert: BottleneckAlert) => {
      await supabase.from("bottleneck_notifications").insert({
        user_id: user.id,
        alert_type: alert.type,
        severity: alert.severity,
        department: alert.department,
        message: alert.message,
        agent_name: alert.agentName || null,
      });
    };

    const detectBottlenecks = async () => {
      const alerts: BottleneckAlert[] = [];

      const { data: tasks } = await supabase
        .from("agent_tasks")
        .select("id, task_category, status, priority, agent_name, due_date, title")
        .eq("user_id", user.id)
        .not("status", "in", '("completed","cancelled")');

      if (tasks && tasks.length > 0) {
        const byCategory: Record<string, typeof tasks> = {};
        tasks.forEach(t => {
          const cat = t.task_category || "geral";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(t);
        });

        Object.entries(byCategory).forEach(([cat, catTasks]) => {
          const pending = catTasks.filter(t => t.status === "pending").length;
          if (pending > 10) {
            alerts.push({
              type: "stalled",
              severity: "warning",
              department: cat,
              message: `${pending} tarefas pendentes em "${cat}" — possível gargalo de produção`,
            });
          }
        });

        const criticalNoAgent = tasks.filter(t => t.priority === "critical" && !t.agent_name);
        if (criticalNoAgent.length > 0) {
          alerts.push({
            type: "overload",
            severity: "critical",
            department: "eficiencia",
            message: `${criticalNoAgent.length} tarefa(s) CRÍTICA(s) sem agente atribuído!`,
          });
        }

        const now = new Date();
        // Apply urgency filter + mute when counting overdue
        const overdueAll = tasks.filter(t => t.due_date && new Date(t.due_date) < now);
        const overdue = overdueAll.filter(t => passesUrgencyFilter(t.priority) && !isMuted((t as any).id));

        if (overdue.length > 5) {
          alerts.push({
            type: "deadline",
            severity: "critical",
            department: "eficiencia",
            message: ` ${overdue.length} tarefas vencidas detectadas! Ação imediata necessária.`,
          });
        } else if (overdue.length > 0) {
          alerts.push({
            type: "deadline",
            severity: "warning",
            department: "eficiencia",
            message: ` ${overdue.length} tarefa(s) com prazo vencido.`,
          });
        }

        const byAgent: Record<string, number> = {};
        tasks.forEach(t => {
          if (t.agent_name) {
            byAgent[t.agent_name] = (byAgent[t.agent_name] || 0) + 1;
          }
        });
        Object.entries(byAgent).forEach(([agent, count]) => {
          if (count > 15) {
            alerts.push({
              type: "overload",
              severity: "warning",
              department: "eficiencia",
              message: `Agente "${agent}" sobrecarregado com ${count} tarefas ativas`,
              agentName: agent,
            });
          }
        });
      }

      // Persist to history (always)
      for (const alert of alerts) {
        await supabase.from("agent_orchestration_log").insert({
          action: `bottleneck_${alert.type}`,
          details: {
            severity: alert.severity,
            department: alert.department,
            message: alert.message,
            detected_at: new Date().toISOString(),
            agent_name: alert.agentName,
          },
        });
        await saveNotification(alert);
      }

      // Group toasts: show one summary toast (clickable) when alerts exceed group size
      if (alerts.length === 0) return alerts;

      const groupSize = getGroupSize();
      if (alerts.length > groupSize) {
        const critical = alerts.filter(a => a.severity === "critical").length;
        toast.error(` Eficiência: ${alerts.length} alertas (${critical} crítico${critical === 1 ? "" : "s"})`, {
          id: "bottleneck-summary",
          duration: 15000,
          description: "Clique para abrir a Central de Eficiência",
          action: { label: "Ver lista", onClick: openEfficiency },
        });
      } else {
        alerts.forEach(alert => {
          const id = `bottleneck-${alert.type}-${alert.department}`;
          const opts = {
            id,
            duration: 15000,
            description: `Departamento: ${DEPT_LABELS[alert.department] || alert.department}`,
            action: { label: "Abrir", onClick: openEfficiency },
          };
          if (alert.severity === "critical") toast.error(` ${alert.message}`, opts);
          else if (alert.severity === "warning") toast.warning(` ${alert.message}`, opts);
          else toast.info(` ${alert.message}`, { id, duration: 15000 });
        });
      }

      return alerts;
    };

    const channel = supabase
      .channel("bottleneck_monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks" }, async (payload) => {
        const task = payload.new as any;
        if (!task) return;

        if (payload.eventType === "INSERT" && task.priority === "critical") {
          await supabase.from("agent_orchestration_log").insert({
            action: "bottleneck_realtime_critical",
            details: {
              severity: "critical",
              message: `Tarefa crítica criada: ${task.title}`,
              task_id: task.id,
              detected_at: new Date().toISOString(),
            },
          });
          await saveNotification({
            type: "overload",
            severity: "critical",
            department: "eficiencia",
            message: `Tarefa crítica criada: ${task.title}`,
          });
        }

        const overdue = task.due_date && new Date(task.due_date) < new Date()
          && task.status !== "completed" && task.status !== "cancelled";
        if (overdue && passesUrgencyFilter(task.priority) && !isMuted(task.id)) {
          toast.error(` Prazo vencido: ${task.title}`, {
            duration: 15000,
            id: `overdue-${task.id}`,
            action: {
              label: "Silenciar 1h",
              onClick: () => {
                import("@/lib/notificationPrefs").then(m => m.muteTask(task.id));
                toast.success("Tarefa silenciada por 1 hora", { duration: 4000 });
              },
            },
          });
        }
      })
      .subscribe();

    detectBottlenecks();
    intervalRef.current = setInterval(detectBottlenecks, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user]);
}
