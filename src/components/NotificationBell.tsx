import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import type { AppNotification } from "@/lib/notifications";

/** Tempo relativo curto em pt-BR (mesmo espírito do NotificationCenter legado). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * Sino de notificações in-app (header, todos os perfis). Ícone dourado + badge
 * vermelho de não-lidas (1→9, depois "9+"). Dropdown com as mais recentes;
 * clicar marca como lida e navega pelo `route`. Tempo real e toast vêm do
 * [[useNotifications]].
 */
export function NotificationBell() {
  const { items, unread, openNotification, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const badge = unread > 9 ? "9+" : String(unread);

  const handleClickItem = async (n: AppNotification) => {
    setOpen(false);
    await openNotification(n);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Notificações"
          aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : "Notificações"}
          style={{
            // Ícone puro, sem borda/pílula: alinha ao gap padrão do .jc-topbar-trailing
            // (nada de marginLeft extra, o que também elimina o corte na borda).
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: 999,
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: "#facc15",
            cursor: "pointer",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.10)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <Bell size={20} strokeWidth={2.4} aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 9,
                background: "#ef4444",
                color: "#ffffff",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[92vw] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Notificações</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck size={13} />
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-[min(420px,70vh)] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <Bell size={26} className="mx-auto mb-2 opacity-40" aria-hidden />
              Nenhuma notificação
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const unreadItem = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void handleClickItem(n)}
                      className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors hover:bg-muted/40 focus:bg-muted/40 outline-none ${
                        unreadItem ? "bg-primary/5" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          unreadItem ? "bg-primary" : "bg-transparent"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm leading-snug ${
                            unreadItem ? "font-semibold text-foreground" : "text-foreground/80"
                          }`}
                        >
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground break-words">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {formatRelative(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
