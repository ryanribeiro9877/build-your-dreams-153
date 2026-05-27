import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { NotificationSettings } from "@/components/NotificationSettings";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Trash2, RefreshCw, ArrowLeft } from "lucide-react";
import { HexagonLoader } from "@/components/HexagonLoader";

interface Row {
  id: string;
  alert_type: string;
  severity: string;
  department: string | null;
  message: string;
  agent_name: string | null;
  is_read: boolean;
  created_at: string;
}

const SEV_BADGE: Record<string, "destructive" | "outline" | "secondary"> = {
  critical: "destructive", warning: "outline", info: "secondary",
};

export default function AdminNotifications() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info">("all");

  const loadRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bottleneck_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error("Erro ao carregar histórico: " + error.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const clearAll = async () => {
    if (!user) return;
    if (!confirm("Limpar todo o histórico de avisos? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase
      .from("bottleneck_notifications")
      .delete()
      .eq("user_id", user.id);
    if (error) { toast.error("Erro ao limpar: " + error.message); return; }
    toast.success("Histórico limpo.");
    void loadRows();
  };

  const clearOne = async (id: string) => {
    const { error } = await supabase.from("bottleneck_notifications").delete().eq("id", id);
    if (error) { toast.error("Erro: " + error.message); return; }
    setRows(rs => rs.filter(r => r.id !== id));
  };

  const visible = filter === "all" ? rows : rows.filter(r => r.severity === filter);

  if (!hasRole("admin")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Admin
            </Button>
            <h1 className="text-2xl font-semibold">Histórico de avisos</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
              {loading ? (
                <HexagonLoader variant="embed" label="Carregando..." className="hexagon-loader--btn" />
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                </>
              )}
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAll} disabled={rows.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" /> Limpar histórico
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <NotificationSettings />
          </div>

          <Card className="md:col-span-2 p-4">
            <div className="flex items-center gap-2 mb-3">
              {(["all", "critical", "warning", "info"] as const).map(f => (
                <Button key={f} size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "Todos" : f === "critical" ? "Crítico" : f === "warning" ? "Alerta" : "Info"}
                </Button>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">{visible.length} registro(s)</span>
            </div>

            <ScrollArea className="h-[60vh] pr-2">
              {loading ? (
                <HexagonLoader variant="compact" label="Carregando..." />
              ) : visible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Sem avisos.</p>
              ) : (
                <ul className="space-y-2">
                  {visible.map(r => (
                    <li key={r.id} className="p-3 rounded-md border border-border bg-card/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={SEV_BADGE[r.severity] || "secondary"} className="text-[10px]">
                              {r.severity.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{r.alert_type}</span>
                            {r.department && <span className="text-xs text-muted-foreground">· {r.department}</span>}
                          </div>
                          <p className="text-sm">{r.message}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {new Date(r.created_at).toLocaleString("pt-BR")}
                            {r.agent_name && ` · ${r.agent_name}`}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => clearOne(r.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}
