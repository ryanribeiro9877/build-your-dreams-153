import { useEffect, useState } from "react";
import {
  getUrgencyFilter, setUrgencyFilter,
  getGroupSize, setGroupSize,
  listMutes, unmuteTask,
  type UrgencyFilter,
} from "@/lib/notificationPrefs";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BellOff } from "lucide-react";

export function NotificationSettings() {
  const [urgency, setUrgency] = useState<UrgencyFilter>(getUrgencyFilter());
  const [groupSize, setGS] = useState<number>(getGroupSize());
  const [mutes, setMutes] = useState(listMutes());

  useEffect(() => {
    const refresh = () => setMutes(listMutes());
    window.addEventListener("notif-prefs-changed", refresh);
    const t = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("notif-prefs-changed", refresh);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
      <h3 className="text-sm font-semibold">Preferências de notificações</h3>

      <div className="space-y-1">
        <Label className="text-xs">Filtro de urgência (tarefas vencidas)</Label>
        <Select
          value={urgency}
          onValueChange={(v) => { setUrgency(v as UrgencyFilter); setUrgencyFilter(v as UrgencyFilter); }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="critical">Apenas crítico</SelectItem>
            <SelectItem value="high">Alto e acima</SelectItem>
            <SelectItem value="medium">Médio e acima</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Agrupar até N avisos por toast</Label>
        <Input
          type="number" min={1} max={50} value={groupSize}
          onChange={(e) => {
            const v = Math.max(1, Math.min(50, parseInt(e.target.value || "5", 10)));
            setGS(v); setGroupSize(v);
          }}
        />
      </div>

      <div>
        <Label className="text-xs flex items-center gap-1">
          <BellOff className="h-3 w-3" /> Tarefas silenciadas ({mutes.length})
        </Label>
        {mutes.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">Nenhuma tarefa silenciada.</p>
        ) : (
          <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
            {mutes.map(m => {
              const left = Math.max(0, Math.round((m.expiresAt - Date.now()) / 60000));
              return (
                <li key={m.taskId} className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1">
                  <span className="truncate font-mono" title={m.taskId}>{m.taskId.slice(0, 8)}…</span>
                  <span className="text-muted-foreground">{left}min</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2"
                    onClick={() => { unmuteTask(m.taskId); setMutes(listMutes()); }}>
                    Reativar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
