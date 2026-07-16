import { useCallback, useEffect, useReducer, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchRecentNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notifications";

/**
 * Estado do sino de notificações (header). `items` são as últimas carregadas
 * (limite visual); `unread` é a contagem do SERVIDOR (pode exceder `items`),
 * por isso é mantida separada e não derivada da lista.
 */
interface State {
  items: AppNotification[];
  unread: number;
}

type Action =
  | { t: "load"; items: AppNotification[]; unread: number }
  | { t: "insert"; n: AppNotification }
  | { t: "update"; n: AppNotification }
  | { t: "markRead"; id: string }
  | { t: "markAll" };

const MAX_ITEMS = 50;

/**
 * Reducer idempotente: a marcação otimista (local) e o ECO do Realtime
 * (postgres_changes UPDATE) não podem decrementar `unread` duas vezes. A regra
 * é decidir o delta pelo estado ANTERIOR do item na lista — se já estava lido,
 * o eco não mexe na contagem.
 */
function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "load":
      return { items: a.items, unread: a.unread };

    case "insert": {
      if (s.items.some((i) => i.id === a.n.id)) return s;
      const unread = a.n.read_at ? s.unread : s.unread + 1;
      return { items: [a.n, ...s.items].slice(0, MAX_ITEMS), unread };
    }

    case "update": {
      const idx = s.items.findIndex((i) => i.id === a.n.id);
      if (idx === -1) return s; // fora da janela carregada → nada a reconciliar
      const wasUnread = !s.items[idx].read_at;
      const nowUnread = !a.n.read_at;
      let unread = s.unread;
      if (wasUnread && !nowUnread) unread = Math.max(0, unread - 1);
      else if (!wasUnread && nowUnread) unread = unread + 1;
      const items = [...s.items];
      items[idx] = a.n;
      return { items, unread };
    }

    case "markRead": {
      const idx = s.items.findIndex((i) => i.id === a.id);
      if (idx === -1 || s.items[idx].read_at) return s; // já lida → no-op
      const items = [...s.items];
      items[idx] = { ...items[idx], read_at: new Date().toISOString() };
      return { items, unread: Math.max(0, s.unread - 1) };
    }

    case "markAll":
      return {
        items: s.items.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })),
        unread: 0,
      };

    default:
      return s;
  }
}

/**
 * Sino de notificações in-app com tempo real. Deve ser montado UMA vez (no
 * header). Carrega contagem + últimas 20 ao entrar e assina o canal
 * `notif:{userId}` para INSERT/UPDATE das PRÓPRIAS linhas (RLS + filtro por
 * user_id como reforço). Em cada INSERT: toast de preview clicável + badge++.
 */
export function useNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? null;
  const [state, dispatch] = useReducer(reducer, { items: [], unread: 0 });

  // `navigate` do react-router pode trocar de referência a cada navegação. Guardamos
  // numa ref para que o efeito de subscription NÃO dependa dele — assim o canal
  // `notif:{userId}` é assinado UMA vez por usuário (padrão canal-fixo da casa) e não
  // é destruído/reassinado a cada troca de rota (o que poderia perder um INSERT).
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Carga inicial (contagem + lista). Falha é silenciosa: o sino nunca deve
  // derrubar o header.
  useEffect(() => {
    if (!userId) {
      dispatch({ t: "load", items: [], unread: 0 });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [items, unread] = await Promise.all([
          fetchRecentNotifications(20),
          fetchUnreadCount(),
        ]);
        if (!cancelled) dispatch({ t: "load", items, unread });
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Realtime: canal por usuário, INSERT + UPDATE das próprias linhas.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification;
          dispatch({ t: "insert", n });
          toast(n.title, {
            description: n.body ?? undefined,
            duration: 6000,
            action: n.route
              ? { label: "Abrir", onClick: () => navigateRef.current(n.route as string) }
              : undefined,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => dispatch({ t: "update", n: payload.new as AppNotification }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Clicar numa notificação: marca lida (otimista + RPC) e navega pelo route.
  const openNotification = useCallback(async (n: AppNotification) => {
    if (!n.read_at) {
      dispatch({ t: "markRead", id: n.id });
      try {
        await markNotificationRead(n.id);
      } catch {
        /* o eco do Realtime / próxima carga reconcilia */
      }
    }
    if (n.route) navigateRef.current(n.route);
  }, []);

  const markAllRead = useCallback(async () => {
    dispatch({ t: "markAll" });
    try {
      await markAllNotificationsRead();
    } catch {
      /* silencioso */
    }
  }, []);

  return { items: state.items, unread: state.unread, openNotification, markAllRead };
}
