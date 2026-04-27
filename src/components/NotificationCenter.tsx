import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
  id: string;
  alert_type: string;
  severity: string;
  department: string | null;
  message: string;
  agent_name: string | null;
  is_read: boolean;
  created_at: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/20 border-red-500/50 text-red-300",
  warning: "bg-yellow-500/20 border-yellow-500/50 text-yellow-300",
  info: "bg-blue-500/20 border-blue-500/50 text-blue-300",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "destructive",
  warning: "outline",
  info: "secondary",
};

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bottleneck_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    for (const id of unreadIds) {
      await supabase.from("bottleneck_notifications").update({ is_read: true }).eq("id", id);
    }
    fetchNotifications();
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}min atrás`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h atrás`;
    return d.toLocaleDateString("pt-BR");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted/20 transition-colors" title="Notificações">
          <span className="text-xl"></span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-[400px] bg-background border-border">
        <SheetHeader className="flex flex-row items-center justify-between pr-4">
          <SheetTitle className="text-foreground"> Central de Alertas</SheetTitle>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs text-muted-foreground">
              Marcar todas como lidas
            </Button>
          )}
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-2">
          {notifications.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-4xl mb-2"></p>
              <p>Nenhuma notificação</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-3 rounded-lg border transition-all ${
                    SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info
                  } ${!n.is_read ? "ring-1 ring-primary/30" : "opacity-70"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug flex-1">{n.message}</p>
                    <Badge variant={SEVERITY_BADGE[n.severity] as any || "secondary"} className="text-[10px] shrink-0">
                      {n.severity === "critical" ? "CRÍTICO" : n.severity === "warning" ? "ALERTA" : "INFO"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                    {n.department && <span> {n.department}</span>}
                    <span> {formatTime(n.created_at)}</span>
                    {!n.is_read && <span className="ml-auto text-primary">● novo</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
