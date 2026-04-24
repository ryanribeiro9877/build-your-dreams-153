import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, XAxis, YAxis,
} from "recharts";
import { ArrowLeft, AlertTriangle, RefreshCw, Trash2, ShieldCheck, Stethoscope, Clock, Download, Filter, Gauge } from "lucide-react";
import { toast } from "sonner";
import {
  getRejectedEvents, getRejectedCount, clearRejectedEvents, onDebugChange,
  getRejectionBuckets, runTrackingHealthCheck,
  getRejectedTtlHours, setRejectedTtlHours,
  getSampleRate, setSampleRate,
  type RejectedEvent, type RejectionBucket, type HealthCheckResult,
} from "@/lib/uiTracking";

/**
 * Admin dashboard for ui_events: lets admins filter by date range, event type,
 * and user, and visualize sidebar/right_panel toggles, shortcut usage,
 * tooltip openings and nav clicks over time.
 *
 * Access is restricted both at the route level and via the SELECT RLS policy
 * (only admins can read ui_events).
 */

type UiEventRow = {
  id: string;
  event_name: string;
  surface: string | null;
  target_id: string | null;
  target_label: string | null;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
};

const ALL_EVENTS = [
  "sidebar_toggle",
  "right_panel_toggle",
  "nav_click",
  "tooltip_open",
  "shortcut_used",
  "tab_navigate",
  "key_activate",
] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function AdminUiEvents() {
  const { user, hasRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [from, setFrom] = useState<string>(isoDaysAgo(7));
  const [to, setTo] = useState<string>(isoDaysAgo(0));
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("");
  const [labelFilter, setLabelFilter] = useState<string>("");
  const [groupBySession, setGroupBySession] = useState<boolean>(false);
  const [rows, setRows] = useState<UiEventRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Debug panel state
  const [rejected, setRejected] = useState<RejectedEvent[]>(getRejectedEvents());
  const [rejectedCount, setRejectedCount] = useState<number>(getRejectedCount());
  const [buckets, setBuckets] = useState<RejectionBucket[]>(getRejectionBuckets());
  const [ttlHours, setTtlHours] = useState<number>(getRejectedTtlHours());
  const [sampleRate, setSampleRateState] = useState<number>(getSampleRate());
  // Drilldown filter for the raw rejected-events table (set from a bucket row).
  const [bucketFilter, setBucketFilter] = useState<RejectionBucket | null>(null);

  useEffect(() => {
    const off = onDebugChange(() => {
      setRejected(getRejectedEvents());
      setRejectedCount(getRejectedCount());
      setBuckets(getRejectionBuckets());
    });
    return () => { off(); };
  }, []);

  // Periodic refresh so TTL pruning is reflected in the UI even without events.
  useEffect(() => {
    const t = setInterval(() => {
      setRejected(getRejectedEvents());
      setRejectedCount(getRejectedCount());
      setBuckets(getRejectionBuckets());
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // Apply TTL change with confirmation + instant prune so admins can verify.
  const applyTtl = (hours: number) => {
    if (!Number.isFinite(hours) || hours <= 0) return;
    setRejectedTtlHours(hours);
    const before = getRejectedCount();
    // setRejectedTtlHours triggers a prune internally; pull the fresh state.
    const after = getRejectedCount();
    setRejected(getRejectedEvents());
    setRejectedCount(after);
    setBuckets(getRejectionBuckets());
    const pruned = Math.max(0, before - after);
    toast.success(`TTL atualizado para ${hours}h`, {
      description: pruned > 0
        ? `${pruned} evento(s) expirado(s) foram removidos imediatamente.`
        : "Nenhum evento expirado a remover agora.",
    });
  };

  const applySampleRate = (rate: number) => {
    const clamped = Math.max(0, Math.min(1, rate));
    setSampleRate(clamped);
    setSampleRateState(clamped);
    toast.success(`Taxa de amostragem: ${Math.round(clamped * 100)}%`, {
      description: clamped === 0
        ? "Tracking pausado. Nenhum evento será enviado."
        : clamped < 1
          ? `Apenas ~${Math.round(clamped * 100)}% dos eventos serão registrados.`
          : "Capturando 100% dos eventos.",
    });
  };

  // Build CSV from a generic array of records.
  function toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return "";
    const headers = Array.from(
      rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>())
    );
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
    return lines.join("\n");
  }

  function download(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const exportDebug = (format: "json" | "csv") => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      const payload = {
        exportedAt: new Date().toISOString(),
        ttlHours,
        sampleRate,
        rejectedCount,
        buckets,
        rejected,
      };
      download(`ui-rejected-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
    } else {
      const csvBuckets = toCsv(buckets.map((b) => ({
        category: b.category, code: b.code ?? "", reason: b.reason,
        count: b.count, lastAt: b.lastAt, lastPayload: b.lastPayload,
      })));
      const csvRejected = toCsv(rejected.map((r) => ({
        at: r.at, name: r.name, category: r.category,
        code: r.code ?? "", reason: r.reason, payload: r.payload,
      })));
      const combined = `# buckets\n${csvBuckets}\n\n# rejected\n${csvRejected}\n`;
      download(`ui-rejected-${stamp}.csv`, combined, "text/csv");
    }
    toast.success(`Exportado (${format.toUpperCase()})`, {
      description: `${rejected.length} evento(s) e ${buckets.length} bucket(s).`,
    });
  };

  // Apply drilldown filter to the raw rejected list shown below.
  const filteredRejected = useMemo(() => {
    if (!bucketFilter) return rejected;
    return rejected.filter((r) =>
      r.category === bucketFilter.category &&
      (r.code ?? null) === (bucketFilter.code ?? null) &&
      r.reason === bucketFilter.reason
    );
  }, [rejected, bucketFilter]);

  // Health-check state
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthHistory, setHealthHistory] = useState<HealthCheckResult[]>([]);
  const handleHealthCheck = async () => {
    setHealthLoading(true);
    const result = await runTrackingHealthCheck();
    setHealthHistory((prev) => [result, ...prev].slice(0, 5));
    setHealthLoading(false);
  };

  const categoryLabel: Record<string, string> = {
    rls: "RLS", payload: "Validação payload", network: "Rede", unknown: "Desconhecido",
  };
  const categoryClass: Record<string, string> = {
    rls: "bg-destructive/15 text-destructive",
    payload: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    network: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    unknown: "bg-muted text-muted-foreground",
  };

  const isAdmin = hasRole("admin");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!isAdmin) {
      navigate("/sistema");
    }
  }, [authLoading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, from, to, eventFilter, userFilter, labelFilter]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("ui_events")
      .select("id,event_name,surface,target_id,target_label,user_id,session_id,created_at")
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lte("created_at", `${to}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (eventFilter !== "all") query = query.eq("event_name", eventFilter);
    if (userFilter.trim()) query = query.eq("user_id", userFilter.trim());
    const lbl = labelFilter.trim();
    if (lbl) query = query.ilike("target_label", `%${lbl}%`);

    const { data, error } = await query;
    if (!error && data) setRows(data as UiEventRow[]);
    setLoading(false);
  }

  // Aggregations
  const totalsByEvent = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) acc[r.event_name] = (acc[r.event_name] ?? 0) + 1;
    return ALL_EVENTS.map((name) => ({ name, total: acc[name] ?? 0 }));
  }, [rows]);

  const dailySeries = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      const bucket = map.get(day) ?? {};
      bucket[r.event_name] = (bucket[r.event_name] ?? 0) + 1;
      map.set(day, bucket);
    }
    const days = Array.from(map.keys()).sort();
    return days.map((day) => ({ day, ...(map.get(day) ?? {}) }));
  }, [rows]);

  const topTargets = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      if (!r.target_label && !r.target_id) continue;
      const key = r.target_label || r.target_id || "—";
      acc[key] = (acc[key] ?? 0) + 1;
    }
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, total]) => ({ label, total }));
  }, [rows]);

  // Group by session — surfaces journeys/funnels and possible navigation jams.
  const sessionGroups = useMemo(() => {
    const map = new Map<string, UiEventRow[]>();
    for (const r of rows) {
      const key = r.session_id ?? "(sem sessão)";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([sessionId, evs]) => {
        const sorted = [...evs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const durationMs = new Date(last.created_at).getTime() - new Date(first.created_at).getTime();
        const eventCounts: Record<string, number> = {};
        for (const e of sorted) eventCounts[e.event_name] = (eventCounts[e.event_name] ?? 0) + 1;
        return {
          sessionId,
          total: sorted.length,
          start: first.created_at,
          end: last.created_at,
          durationMs,
          user_id: first.user_id,
          eventCounts,
          firstEvent: first.event_name,
          lastEvent: last.event_name,
          lastTarget: last.target_label ?? last.target_id ?? "—",
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 50);
  }, [rows]);

  if (authLoading || !isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sistema")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-xl font-semibold">Analytics de UI</h1>
        <span className="text-sm text-muted-foreground ml-2">
          {rows.length} eventos no período
        </span>
      </header>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="from">De</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to">Até</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label>Tipo de evento</Label>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {ALL_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="user">User ID</Label>
              <Input
                id="user"
                placeholder="UUID do usuário (opcional)"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="label">Buscar por label do alvo</Label>
              <Input
                id="label"
                placeholder="ex: Cível, Perfil, Recolher…"
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch id="group" checked={groupBySession} onCheckedChange={setGroupBySession} />
              <Label htmlFor="group" className="cursor-pointer">Agrupar por sessão</Label>
            </div>
          </CardContent>
        </Card>

        {/* Health-check */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              Verificação de saúde do tracking
            </CardTitle>
            <Button size="sm" variant="default" onClick={handleHealthCheck} disabled={healthLoading}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              {healthLoading ? "Testando…" : "Executar verificação"}
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Insere um evento sintético em <code className="font-mono">ui_events</code> para validar
              que o tracking está funcionando antes de você testar mudanças.
            </p>
            {healthHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma verificação executada nesta sessão.</p>
            ) : (
              <div className="space-y-2">
                {healthHistory.map((h, i) => (
                  <div
                    key={`${h.at}-${i}`}
                    className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
                      h.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"
                    }`}
                  >
                    <span className={`mt-0.5 h-2 w-2 rounded-full ${h.ok ? "bg-emerald-500" : "bg-destructive"}`} />
                    <div className="flex-1">
                      <div className="font-medium">
                        {h.ok ? "OK — inserção aceita" : "Falha — inserção rejeitada"}
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {h.durationMs}ms · {new Date(h.at).toLocaleTimeString()}
                        </span>
                      </div>
                      {!h.ok && (
                        <div className="mt-1 text-xs text-destructive">
                          {h.category && (
                            <span className={`inline-block mr-2 px-1.5 py-0.5 rounded ${categoryClass[h.category]}`}>
                              {categoryLabel[h.category]}
                            </span>
                          )}
                          {h.reason} {h.code ? `(${h.code})` : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debug panel */}
        <Card className={rejectedCount > 0 ? "border-destructive/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${rejectedCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              Modo de depuração — eventos rejeitados nesta sessão
              <span className={`ml-2 px-2 py-0.5 rounded-md text-xs font-mono ${rejectedCount > 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                {rejectedCount}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <Label htmlFor="ttl" className="text-xs">TTL (h)</Label>
                <Input
                  id="ttl"
                  type="number"
                  min={1}
                  max={72}
                  value={ttlHours}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTtlHours(v);
                    if (v > 0) setRejectedTtlHours(v);
                  }}
                  className="h-7 w-16 text-xs"
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => {
                setRejected(getRejectedEvents()); setRejectedCount(getRejectedCount()); setBuckets(getRejectionBuckets());
              }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
              </Button>
              <Button size="sm" variant="ghost" onClick={clearRejectedEvents} disabled={rejectedCount === 0}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Buckets aggregated by reason/code */}
            {buckets.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Falhas agrupadas por motivo</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left border-b border-border">
                      <tr>
                        <th className="py-2 pr-3">Categoria</th>
                        <th className="py-2 pr-3">Código</th>
                        <th className="py-2 pr-3">Motivo</th>
                        <th className="py-2 pr-3">Ocorrências</th>
                        <th className="py-2 pr-3">Última</th>
                        <th className="py-2 pr-3">Último payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buckets.map((b) => (
                        <tr key={b.key} className="border-b border-border/50 align-top">
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${categoryClass[b.category]}`}>
                              {categoryLabel[b.category]}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-xs">{b.code ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-destructive max-w-sm truncate" title={b.reason}>{b.reason}</td>
                          <td className="py-1.5 pr-3 font-mono">{b.count}</td>
                          <td className="py-1.5 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(b.lastAt).toLocaleString()}
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-[11px] max-w-md truncate" title={JSON.stringify(b.lastPayload)}>
                            {JSON.stringify(b.lastPayload)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {rejected.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma falha registrada nesta sessão (ou expirada pelo TTL de {ttlHours}h). RLS, payload e rede estão OK.
              </p>
            ) : (
              <div>
                <h3 className="text-sm font-semibold mb-2">Eventos brutos recentes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left border-b border-border">
                      <tr>
                        <th className="py-2 pr-3">Quando</th>
                        <th className="py-2 pr-3">Evento</th>
                        <th className="py-2 pr-3">Categoria</th>
                        <th className="py-2 pr-3">Motivo</th>
                        <th className="py-2 pr-3">Código</th>
                        <th className="py-2 pr-3">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejected.slice().reverse().slice(0, 20).map((r, i) => (
                        <tr key={`${r.at}-${i}`} className="border-b border-border/50 align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                            {new Date(r.at).toLocaleString()}
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-xs">{r.name}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${categoryClass[r.category]}`}>
                              {categoryLabel[r.category]}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-destructive">{r.reason}</td>
                          <td className="py-1.5 pr-3 font-mono text-xs">{r.code ?? "—"}</td>
                          <td className="py-1.5 pr-3 font-mono text-[11px] max-w-md truncate" title={JSON.stringify(r.payload)}>
                            {JSON.stringify(r.payload)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Totals by event */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totais por evento</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ChartContainer config={{ total: { label: "Total", color: "hsl(var(--primary))" } }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalsByEvent}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Time series */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução diária</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ChartContainer
              config={Object.fromEntries(
                ALL_EVENTS.map((e, i) => [
                  e,
                  { label: e, color: `hsl(${(i * 47) % 360} 70% 55%)` },
                ])
              )}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  {ALL_EVENTS.map((e, i) => (
                    <Line
                      key={e}
                      type="monotone"
                      dataKey={e}
                      stroke={`hsl(${(i * 47) % 360} 70% 55%)`}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Top targets */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top alvos clicados/focados</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ChartContainer config={{ total: { label: "Interações", color: "hsl(var(--primary))" } }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTargets} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Sessions (group-by-session view) */}
        {groupBySession && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sessões ({sessionGroups.length}) — possíveis gargalos
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-border">
                  <tr>
                    <th className="py-2 pr-3">Sessão</th>
                    <th className="py-2 pr-3">Eventos</th>
                    <th className="py-2 pr-3">Duração</th>
                    <th className="py-2 pr-3">Início → Fim</th>
                    <th className="py-2 pr-3">Último alvo</th>
                    <th className="py-2 pr-3">Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionGroups.map((g) => {
                    const mins = Math.round(g.durationMs / 60000);
                    const secs = Math.round((g.durationMs % 60000) / 1000);
                    return (
                      <tr key={g.sessionId} className="border-b border-border/50 align-top">
                        <td className="py-1.5 pr-3 font-mono text-[11px]">{g.sessionId.slice(0, 18)}…</td>
                        <td className="py-1.5 pr-3">
                          <div className="font-semibold">{g.total}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {Object.entries(g.eventCounts).map(([k, v]) => `${k}:${v}`).join(" · ")}
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {mins > 0 ? `${mins}m ` : ""}{secs}s
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(g.start).toLocaleTimeString()} → {new Date(g.end).toLocaleTimeString()}
                        </td>
                        <td className="py-1.5 pr-3">{g.lastTarget}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">
                          {g.user_id ? g.user_id.slice(0, 8) : "anon"}
                        </td>
                      </tr>
                    );
                  })}
                  {sessionGroups.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhuma sessão no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Recent rows */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Últimos eventos {loading && <span className="text-muted-foreground text-xs">(carregando…)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-border">
                <tr>
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Evento</th>
                  <th className="py-2 pr-3">Surface</th>
                  <th className="py-2 pr-3">Alvo</th>
                  <th className="py-2 pr-3">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{r.event_name}</td>
                    <td className="py-1.5 pr-3">{r.surface ?? "—"}</td>
                    <td className="py-1.5 pr-3">{r.target_label ?? r.target_id ?? "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      {r.user_id ? r.user_id.slice(0, 8) : "anon"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nenhum evento no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
