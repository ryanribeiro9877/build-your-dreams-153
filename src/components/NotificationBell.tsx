import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  MessageSquare,
  Reply,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import type { AppNotification } from "@/lib/notifications";

/**
 * Paleta canônica do JurisAI (AGENTS.md §5). Definida aqui em valores explícitos
 * porque os tokens shadcn (`--card`, `--primary`) do tema NÃO batem com o preto+
 * dourado do shell `.jc-*` — o painel precisa da paleta real, não do cinza padrão.
 */
const T = {
  bg2: "#11111a",
  bg3: "#16161f",
  border: "#25253a",
  text1: "#eeeef5",
  text3: "#7a7a92",
  gold: "#EAB308",
} as const;

/**
 * Diferenciação por TIPO. As chaves são os valores REAIS de `notifications.type`
 * definidos no backend (enum `email_notification_type`, migração V20). Hoje só o
 * gatilho `trg_notify_task_assignment` produz linhas (`task_assigned`); os demais
 * já têm mapeamento para quando forem ligados. `fallback` cobre tipos futuros sem
 * inventar rótulo. Cores sóbrias, coerentes com o tema escuro (o roxo espelha o
 * `assistant_root` de §5).
 */
interface TypeToken {
  rotulo: string;
  cor: string;
  Icone: LucideIcon;
}
const TYPE_TOKENS: Record<string, TypeToken> = {
  task_assigned: { rotulo: "Tarefa", cor: T.gold, Icone: ClipboardList },
  task_validation_required: { rotulo: "Validação", cor: "#3B82F6", Icone: ClipboardCheck },
  task_validated: { rotulo: "Aprovada", cor: "#22C55E", Icone: Check },
  task_rejected: { rotulo: "Rejeitada", cor: "#EF4444", Icone: XCircle },
  inter_assistant_received: { rotulo: "Pedido", cor: "#8B5CF6", Icone: MessageSquare },
  inter_assistant_answered: { rotulo: "Resposta", cor: "#8B5CF6", Icone: Reply },
};
const FALLBACK_TOKEN: TypeToken = { rotulo: "Aviso", cor: T.text3, Icone: Bell };

function resolveType(type: string): TypeToken {
  return TYPE_TOKENS[type] ?? FALLBACK_TOKEN;
}

/** Hex de 6 dígitos + alpha em 2 dígitos (ex.: cor translúcida do selo/trilho). */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

/** Tempo relativo curto em pt-BR. Substitui a data absoluta do painel antigo. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ontem";
  if (diffD < 7) return `há ${diffD} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

type TemporalGroup = "Hoje" | "Esta semana" | "Anteriores";
const GROUP_ORDER: TemporalGroup[] = ["Hoje", "Esta semana", "Anteriores"];

function temporalGroup(iso: string): TemporalGroup {
  const then = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (then.getTime() >= start.getTime()) return "Hoje";
  const diffDays = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (diffDays < 7) return "Esta semana";
  return "Anteriores";
}

type Filtro = "todas" | "nao_lidas";

interface ItemProps {
  n: AppNotification;
  onOpen: (n: AppNotification) => void;
  onMarkRead: (id: string) => void;
}

/**
 * Item de notificação: trilho de cor + ícone + selo por tipo, sem divisórias.
 * O card inteiro navega (marca lida + deep-link); o botão de marcar-lida do canto
 * NÃO navega e tem equivalente acessível por teclado (revelado no `focus-visible`,
 * não só no hover).
 */
function ItemNotificacao({ n, onOpen, onMarkRead }: ItemProps) {
  const unread = !n.read_at;
  const t = resolveType(n.type);
  const { Icone } = t;

  return (
    <li className="group relative">
      <div
        className={`relative rounded-[14px] border transition-colors ${
          unread
            ? "bg-white/[0.045] border-white/[0.07] hover:bg-white/[0.07] hover:border-white/10"
            : "bg-transparent border-transparent hover:bg-white/[0.035] hover:border-white/[0.06]"
        }`}
      >
        {/* Trilho de cor do tipo — substitui as antigas divisórias claras */}
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-opacity"
          style={{
            background: t.cor,
            opacity: unread ? 1 : 0.25,
            boxShadow: unread ? `0 0 10px ${withAlpha(t.cor, "55")}` : "none",
          }}
        />

        <button
          type="button"
          onClick={() => onOpen(n)}
          className="w-full text-left flex gap-3 items-start pl-4 pr-10 py-3.5 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <span
            aria-hidden
            className="shrink-0 grid place-items-center rounded-[11px]"
            style={{
              width: 38,
              height: 38,
              background: withAlpha(t.cor, "1F"),
              border: `1px solid ${withAlpha(t.cor, "33")}`,
            }}
          >
            <Icone size={18} strokeWidth={2} style={{ color: t.cor }} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span
                className="text-[13.5px] leading-tight truncate"
                style={{
                  fontWeight: unread ? 700 : 500,
                  color: unread ? T.text1 : "rgba(238,238,245,0.6)",
                }}
              >
                {n.title}
              </span>
              <span
                className="shrink-0 uppercase"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  color: t.cor,
                  background: withAlpha(t.cor, "1F"),
                  padding: "2px 7px",
                  borderRadius: 20,
                  opacity: unread ? 1 : 0.55,
                }}
              >
                {t.rotulo}
              </span>
            </span>

            {n.body && (
              <span
                className="mt-1 block text-[12.5px] leading-snug break-words"
                style={{
                  color: unread ? "rgba(238,238,245,0.72)" : "rgba(238,238,245,0.4)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {n.body}
              </span>
            )}

            <span className="mt-1.5 block text-[11px]" style={{ color: T.text3 }}>
              {formatRelative(n.created_at)}
            </span>
          </span>
        </button>

        {/* Ação do canto: ponto de não-lida (mouse ocioso) → botão marcar-lida (hover/foco) */}
        <div className="absolute right-2.5 top-3.5 w-7 h-7">
          {unread ? (
            <>
              <span
                aria-hidden
                className="absolute inset-0 m-auto h-2 w-2 rounded-full opacity-100 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                style={{ background: t.cor, boxShadow: `0 0 8px ${withAlpha(t.cor, "88")}` }}
              />
              <button
                type="button"
                title="Marcar como lida"
                aria-label={`Marcar "${n.title}" como lida`}
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead(n.id);
                }}
                className="absolute inset-0 grid place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 opacity-0 pointer-events-none transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:ring-2 focus-visible:ring-white/20 outline-none"
              >
                <Check size={14} />
              </button>
            </>
          ) : (
            <ChevronRight
              aria-hidden
              size={16}
              className="absolute inset-0 m-auto opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: T.text3 }}
            />
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Sino de notificações in-app (header, todos os perfis). Ícone dourado + badge
 * vermelho de não-lidas (1→9, depois "9+"). Dropdown com diferenciação por tipo,
 * agrupamento temporal e filtro Todas/Não lidas. Tempo real, toast e persistência
 * do "marcar como lida" vêm do [[useNotifications]] (fonte real `public.notifications`).
 */
export function NotificationBell() {
  const { items, unread, openNotification, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const badge = unread > 9 ? "9+" : String(unread);

  const handleOpenItem = (n: AppNotification) => {
    setOpen(false);
    void openNotification(n);
  };

  const visiveis = useMemo(
    () => (filtro === "nao_lidas" ? items.filter((n) => !n.read_at) : items),
    [items, filtro],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<TemporalGroup, AppNotification[]>();
    for (const n of visiveis) {
      const g = temporalGroup(n.created_at);
      const bucket = mapa.get(g);
      if (bucket) bucket.push(n);
      else mapa.set(g, [n]);
    }
    return GROUP_ORDER.filter((g) => mapa.get(g)?.length).map(
      (g) => [g, mapa.get(g) as AppNotification[]] as const,
    );
  }, [visiveis]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="jc-notif-bell"
          title="Notificações"
          aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : "Notificações"}
          style={{
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
        className="w-[380px] max-w-[92vw] p-0 overflow-hidden rounded-2xl"
        style={{
          background: `linear-gradient(180deg, ${T.bg3} 0%, ${T.bg2} 100%)`,
          border: `1px solid ${T.border}`,
          color: T.text1,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        {/* Cabeçalho */}
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="relative grid place-items-center rounded-[10px]"
                style={{
                  width: 34,
                  height: 34,
                  background: withAlpha(T.gold, "1A"),
                  border: `1px solid ${withAlpha(T.gold, "40")}`,
                }}
              >
                <Bell size={16} style={{ color: T.gold }} aria-hidden />
              </span>
              <h2 className="m-0 text-[15px] font-bold" style={{ color: T.text1 }}>
                Notificações
              </h2>
            </div>

            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                title="Marcar todas como lidas"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/20 outline-none"
              >
                <CheckCheck size={13} />
                Marcar todas
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="mt-3.5 flex gap-1.5 pb-3">
            {([
              { id: "todas", rotulo: "Todas" },
              { id: "nao_lidas", rotulo: `Não lidas${unread ? ` · ${unread}` : ""}` },
            ] as const).map((f) => {
              const ativo = filtro === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  aria-pressed={ativo}
                  className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-white/20 outline-none"
                  style={{
                    border: `1px solid ${ativo ? withAlpha(T.gold, "73") : "rgba(255,255,255,0.08)"}`,
                    background: ativo ? withAlpha(T.gold, "24") : "transparent",
                    color: ativo ? T.gold : "rgba(238,238,245,0.45)",
                  }}
                >
                  {f.rotulo}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista agrupada */}
        <div className="max-h-[min(480px,70vh)] overflow-y-auto px-2.5 pb-3.5 pt-1">
          {grupos.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Bell size={28} className="mx-auto mb-2.5 opacity-20" aria-hidden />
              <div className="text-sm font-semibold" style={{ color: "rgba(238,238,245,0.6)" }}>
                Tudo em dia
              </div>
              <div className="mt-1 text-[13px]" style={{ color: T.text3 }}>
                {filtro === "nao_lidas"
                  ? "Nenhuma notificação não lida por aqui."
                  : "Nenhuma notificação por aqui."}
              </div>
            </div>
          ) : (
            grupos.map(([grupo, itens]) => (
              <div key={grupo}>
                <div
                  className="px-2 pb-1.5 pt-3 text-[10.5px] font-extrabold uppercase"
                  style={{ letterSpacing: 1.4, color: "rgba(238,238,245,0.3)" }}
                >
                  {grupo}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {itens.map((n) => (
                    <ItemNotificacao
                      key={n.id}
                      n={n}
                      onOpen={handleOpenItem}
                      onMarkRead={(id) => void markRead(id)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
