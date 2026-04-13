import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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

export function useBottleneckDetection() {
  const { user } = useAuth();
  const initialized = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;

    const detectBottlenecks = async () => {
      const alerts: BottleneckAlert[] = [];

      // 1. Check for overloaded task categories (>80% tasks pending/in_progress)
      const { data: tasks } = await supabase
        .from("agent_tasks")
        .select("task_category, status, priority, agent_name, due_date, title")
        .eq("user_id", user.id)
        .not("status", "in", '("completed","cancelled")');

      if (tasks && tasks.length > 0) {
        // Group by category
        const byCategory: Record<string, typeof tasks> = {};
        tasks.forEach(t => {
          const cat = t.task_category || "geral";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(t);
        });

        // Detect overloaded categories
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

        // Detect critical tasks without agent
        const criticalNoAgent = tasks.filter(t => t.priority === "critical" && !t.agent_name);
        if (criticalNoAgent.length > 0) {
          alerts.push({
            type: "overload",
            severity: "critical",
            department: "eficiencia",
            message: `${criticalNoAgent.length} tarefa(s) CRÍTICA(s) sem agente atribuído!`,
          });
        }

        // Detect overdue tasks
        const now = new Date();
        const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < now);
        if (overdue.length > 5) {
          alerts.push({
            type: "deadline",
            severity: "critical",
            department: "eficiencia",
            message: `🚨 ${overdue.length} tarefas vencidas detectadas! Ação imediata necessária.`,
          });
        } else if (overdue.length > 0) {
          alerts.push({
            type: "deadline",
            severity: "warning",
            department: "eficiencia",
            message: `⏰ ${overdue.length} tarefa(s) com prazo vencido.`,
          });
        }

        // Detect agents with too many tasks
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

      // Log alerts to orchestration log
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
      }

      // Display alerts as toasts
      alerts.forEach(alert => {
        const id = `bottleneck-${alert.type}-${alert.department}`;
        if (alert.severity === "critical") {
          toast.error(`🧠 Central de Eficiência: ${alert.message}`, {
            duration: 12000, id,
            description: `Departamento: ${DEPT_LABELS[alert.department] || alert.department}`,
          });
        } else if (alert.severity === "warning") {
          toast.warning(`🧠 Eficiência: ${alert.message}`, {
            duration: 8000, id,
            description: `Detectado em: ${DEPT_LABELS[alert.department] || alert.department}`,
          });
        } else {
          toast.info(`🧠 ${alert.message}`, { duration: 5000, id });
        }
      });

      return alerts;
    };

    // Listen to task changes in real-time for immediate bottleneck detection
    const channel = supabase
      .channel("bottleneck_monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks" }, async (payload) => {
        const task = payload.new as any;
        if (!task) return;

        // Immediate alert for critical priority new tasks
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
        }

        // Check if task just became overdue
        if (task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed" && task.status !== "cancelled") {
          toast.error(`🧠 Eficiência detectou prazo vencido: ${task.title}`, {
            duration: 10000,
            id: `overdue-${task.id}`,
          });
        }
      })
      .subscribe();

    // Run initial check + periodic (every 5 minutes)
    detectBottlenecks();
    intervalRef.current = setInterval(detectBottlenecks, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user]);
}
