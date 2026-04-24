import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Coins, ArrowLeft, TrendingUp, TrendingDown, DollarSign, Users,
  ShoppingCart, Zap, Gift, RefreshCw, Filter, X, Eye,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from "recharts";

interface UserStats {
  user_id: string;
  display_name: string | null;
  balance: number;
  total_purchased: number;
  total_consumed: number;
}

interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
}

const REVENUE_PER_TOKEN = 0.0198;
const PAGE_SIZE = 25;

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "14", label: "Últimos 14 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "all", label: "Todo o período" },
];

export default function AdminTokens() {
  const navigate = useNavigate();
  const { hasRole, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserStats[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [period, setPeriod] = useState<string>("14");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // User detail modal
  const [detailUser, setDetailUser] = useState<UserStats | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!hasRole("admin")) {
      navigate("/sistema");
      return;
    }
    fetchData();
  }, [authLoading, hasRole, navigate]);

  async function fetchData() {
    setLoading(true);
    const [balancesRes, txRes, profilesRes] = await Promise.all([
      supabase.from("token_balances").select("user_id, balance, total_purchased, total_consumed"),
      supabase.from("token_transactions").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("profiles").select("user_id, display_name"),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p.display_name]));
    const merged: UserStats[] = (balancesRes.data || []).map((b) => ({
      user_id: b.user_id,
      display_name: profileMap.get(b.user_id) || null,
      balance: b.balance,
      total_purchased: b.total_purchased,
      total_consumed: b.total_consumed,
    }));
    merged.sort((a, b) => b.total_consumed - a.total_consumed);
    setUsers(merged);
    setTransactions((txRes.data || []) as Transaction[]);
    setLoading(false);
  }

  // Apply period + user filter to transactions
  const filteredTransactions = useMemo(() => {
    let from: number | null = null;
    if (period !== "all") {
      const days = parseInt(period, 10);
      from = Date.now() - days * 24 * 60 * 60 * 1000;
    }
    return transactions.filter((t) => {
      if (from && new Date(t.created_at).getTime() < from) return false;
      if (userFilter !== "all" && t.user_id !== userFilter) return false;
      return true;
    });
  }, [transactions, period, userFilter]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [period, userFilter]);

  // Aggregates respect filters
  const filteredPurchased = filteredTransactions
    .filter((t) => t.transaction_type === "purchase")
    .reduce((s, t) => s + t.amount, 0);
  const filteredConsumed = filteredTransactions
    .filter((t) => t.transaction_type === "consumption")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const filteredRevenue = filteredPurchased * REVENUE_PER_TOKEN;
  const totalUsers = users.length;
  const totalBalance = users.reduce((s, u) => s + u.balance, 0);

  // Trend chart based on filtered range
  const trendData = useMemo(() => {
    const days = period === "all" ? 30 : parseInt(period, 10);
    const out: { date: string; consumido: number; comprado: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const dayTx = filteredTransactions.filter((t) => t.created_at.slice(0, 10) === key);
      const consumido = dayTx.filter((t) => t.transaction_type === "consumption").reduce((s, t) => s + Math.abs(t.amount), 0);
      const comprado = dayTx.filter((t) => t.transaction_type === "purchase").reduce((s, t) => s + t.amount, 0);
      out.push({ date: label, consumido, comprado });
    }
    return out;
  }, [filteredTransactions, period]);

  const typeIcon: Record<string, JSX.Element> = {
    purchase: <ShoppingCart className="w-4 h-4 text-emerald-400" />,
    consumption: <Zap className="w-4 h-4 text-orange-400" />,
    bonus: <Gift className="w-4 h-4 text-purple-400" />,
    refund: <RefreshCw className="w-4 h-4 text-blue-400" />,
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTx = filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Detail modal: per-type breakdown for selected user
  const detailData = useMemo(() => {
    if (!detailUser) return null;
    const userTx = transactions.filter((t) => t.user_id === detailUser.user_id);
    const consumptionTx = userTx.filter((t) => t.transaction_type === "consumption");

    // Categorize by description prefix
    const buckets = { simples: 0, pesquisa: 0, peticao: 0, outros: 0 };
    consumptionTx.forEach((t) => {
      const desc = (t.description || "").toLowerCase();
      const amt = Math.abs(t.amount);
      if (amt === 1 || desc.includes("comando") || desc.includes("simples")) buckets.simples += amt;
      else if (amt === 5 || desc.includes("pesquisa") || desc.includes("jurisprud")) buckets.pesquisa += amt;
      else if (amt === 10 || desc.includes("petição") || desc.includes("peticao") || desc.includes("documento")) buckets.peticao += amt;
      else buckets.outros += amt;
    });

    const breakdown = [
      { tipo: "Comandos simples", tokens: buckets.simples },
      { tipo: "Pesquisa jurídica", tokens: buckets.pesquisa },
      { tipo: "Geração de petição", tokens: buckets.peticao },
      { tipo: "Outros", tokens: buckets.outros },
    ];

    return { userTx: userTx.slice(0, 100), breakdown };
  }, [detailUser, transactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#09090f]">
        <Coins className="w-8 h-8 text-[#c9a84c] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090f] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-[#c9a84c] hover:bg-[#c9a84c]/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Coins className="w-6 h-6 text-[#c9a84c]" />
          <h1 className="text-2xl font-bold text-[#c9a84c]">Dashboard de Tokens (Admin)</h1>
        </div>

        {/* Filters */}
        <Card className="bg-[#1a1a2e] border-[#c9a84c]/20">
          <CardContent className="py-4 flex flex-col md:flex-row gap-4 md:items-end">
            <div className="flex items-center gap-2 text-[#c9a84c]">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">Filtros</span>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs text-white/60 mb-1 block">Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="bg-[#0f0f1a] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs text-white/60 mb-1 block">Usuário</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="bg-[#0f0f1a] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10 text-white max-h-72">
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.display_name || u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(period !== "14" || userFilter !== "all") && (
              <Button
                variant="ghost"
                onClick={() => { setPeriod("14"); setUserFilter("all"); }}
                className="text-white/60 hover:text-white"
              >
                <X className="w-4 h-4 mr-1" /> Limpar
              </Button>
            )}
          </CardContent>
        </Card>

        {/* KPIs (filtered) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-emerald-400/80 flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Receita no período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-emerald-400">
                R$ {filteredRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-[#1a1a2e] border-[#c9a84c]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#c9a84c]/80 flex items-center gap-2">
                <Users className="w-4 h-4" /> Usuários
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-[#c9a84c]">{totalUsers}</span>
            </CardContent>
          </Card>
          <Card className="bg-[#1a1a2e] border-orange-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-400/80 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" /> Consumido no período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-orange-400">{filteredConsumed.toLocaleString()}</span>
              <span className="text-xs text-white/40 ml-1">tokens</span>
            </CardContent>
          </Card>
          <Card className="bg-[#1a1a2e] border-blue-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-400/80 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Saldo Acumulado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-blue-400">{totalBalance.toLocaleString()}</span>
              <span className="text-xs text-white/40 ml-1">tokens</span>
            </CardContent>
          </Card>
        </div>

        {/* Trend Chart */}
        <Card className="bg-[#1a1a2e] border-[#c9a84c]/20">
          <CardHeader>
            <CardTitle className="text-[#c9a84c]">Tendência ({PERIOD_OPTIONS.find((p) => p.value === period)?.label})</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis dataKey="date" stroke="#888" style={{ fontSize: 11 }} />
                <YAxis stroke="#888" style={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #c9a84c40", borderRadius: 8, color: "#fff" }}
                  labelStyle={{ color: "#c9a84c" }}
                />
                <Line type="monotone" dataKey="consumido" stroke="#fb923c" strokeWidth={2} name="Consumido" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="comprado" stroke="#34d399" strokeWidth={2} name="Comprado" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Consumers */}
        <Card className="bg-[#1a1a2e] border-[#c9a84c]/20">
          <CardHeader>
            <CardTitle className="text-[#c9a84c]">Top Usuários por Consumo (clique para detalhar)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Usuário</TableHead>
                  <TableHead className="text-white/60 text-right">Saldo</TableHead>
                  <TableHead className="text-white/60 text-right">Adquirido</TableHead>
                  <TableHead className="text-white/60 text-right">Consumido</TableHead>
                  <TableHead className="text-white/60 text-right">Receita (R$)</TableHead>
                  <TableHead className="text-white/60 text-right w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.slice(0, 20).map((u) => (
                  <TableRow
                    key={u.user_id}
                    className="border-white/5 cursor-pointer hover:bg-white/5"
                    onClick={() => setDetailUser(u)}
                  >
                    <TableCell className="text-white">{u.display_name || u.user_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right font-mono text-[#c9a84c]">{u.balance.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">{u.total_purchased.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-orange-400">{u.total_consumed.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-300">
                      {(u.total_purchased * REVENUE_PER_TOKEN).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Eye className="w-4 h-4 text-white/40 inline" />
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-white/40 py-6">Nenhum dado disponível</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Transactions with Pagination */}
        <Card className="bg-[#1a1a2e] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">
              Transações ({filteredTransactions.length.toLocaleString()})
            </CardTitle>
            <span className="text-xs text-white/50">Página {page} de {totalPages}</span>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-white/60">Tipo</TableHead>
                    <TableHead className="text-white/60">Usuário</TableHead>
                    <TableHead className="text-white/60">Descrição</TableHead>
                    <TableHead className="text-white/60 text-right">Tokens</TableHead>
                    <TableHead className="text-white/60 text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedTx.map((tx) => {
                    const userName = users.find((u) => u.user_id === tx.user_id)?.display_name || tx.user_id.slice(0, 8);
                    return (
                      <TableRow key={tx.id} className="border-white/5">
                        <TableCell>{typeIcon[tx.transaction_type] || typeIcon.consumption}</TableCell>
                        <TableCell className="text-white/80 text-sm">{userName}</TableCell>
                        <TableCell className="text-white/60 text-xs">{tx.description || "—"}</TableCell>
                        <TableCell className={`text-right font-mono font-bold ${tx.amount > 0 ? "text-emerald-400" : "text-orange-400"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount}
                        </TableCell>
                        <TableCell className="text-right text-white/50 text-xs">
                          {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {pagedTx.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-6">Nenhuma transação no filtro</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                      className={`${page === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"} text-white hover:bg-white/10`}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <span key={p} className="flex items-center">
                        {idx > 0 && p - arr[idx - 1] > 1 && (
                          <PaginationItem><PaginationEllipsis className="text-white/40" /></PaginationItem>
                        )}
                        <PaginationItem>
                          <PaginationLink
                            onClick={(e) => { e.preventDefault(); setPage(p); }}
                            isActive={p === page}
                            className={`cursor-pointer ${p === page ? "bg-[#c9a84c] text-black border-[#c9a84c]" : "text-white hover:bg-white/10"}`}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      </span>
                    ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                      className={`${page === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"} text-white hover:bg-white/10`}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Detail Dialog */}
      <Dialog open={!!detailUser} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent className="bg-[#1a1a2e] border-[#c9a84c]/30 text-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#c9a84c] flex items-center gap-2">
              <Users className="w-5 h-5" />
              {detailUser?.display_name || detailUser?.user_id.slice(0, 8)}
            </DialogTitle>
          </DialogHeader>

          {detailUser && detailData && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0f0f1a] rounded-lg p-3 border border-[#c9a84c]/20">
                  <div className="text-xs text-white/50">Saldo</div>
                  <div className="text-xl font-bold text-[#c9a84c]">{detailUser.balance.toLocaleString()}</div>
                </div>
                <div className="bg-[#0f0f1a] rounded-lg p-3 border border-emerald-500/20">
                  <div className="text-xs text-white/50">Adquirido</div>
                  <div className="text-xl font-bold text-emerald-400">{detailUser.total_purchased.toLocaleString()}</div>
                </div>
                <div className="bg-[#0f0f1a] rounded-lg p-3 border border-orange-500/20">
                  <div className="text-xs text-white/50">Consumido</div>
                  <div className="text-xl font-bold text-orange-400">{detailUser.total_consumed.toLocaleString()}</div>
                </div>
              </div>

              {/* Consumption by type */}
              <div>
                <h3 className="text-sm font-medium text-[#c9a84c] mb-2">Consumo por tipo</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={detailData.breakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                    <XAxis dataKey="tipo" stroke="#888" style={{ fontSize: 10 }} />
                    <YAxis stroke="#888" style={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #c9a84c40", borderRadius: 8, color: "#fff" }}
                      cursor={{ fill: "#c9a84c10" }}
                    />
                    <Bar dataKey="tokens" fill="#fb923c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Full transaction history */}
              <div>
                <h3 className="text-sm font-medium text-[#c9a84c] mb-2">Histórico completo (últimas 100)</h3>
                <div className="max-h-72 overflow-y-auto border border-white/10 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 sticky top-0 bg-[#1a1a2e]">
                        <TableHead className="text-white/60">Tipo</TableHead>
                        <TableHead className="text-white/60">Descrição</TableHead>
                        <TableHead className="text-white/60 text-right">Tokens</TableHead>
                        <TableHead className="text-white/60 text-right">Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailData.userTx.map((tx) => (
                        <TableRow key={tx.id} className="border-white/5">
                          <TableCell>{typeIcon[tx.transaction_type] || typeIcon.consumption}</TableCell>
                          <TableCell className="text-white/70 text-xs">{tx.description || "—"}</TableCell>
                          <TableCell className={`text-right font-mono font-bold ${tx.amount > 0 ? "text-emerald-400" : "text-orange-400"}`}>
                            {tx.amount > 0 ? "+" : ""}{tx.amount}
                          </TableCell>
                          <TableCell className="text-right text-white/50 text-xs">
                            {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                        </TableRow>
                      ))}
                      {detailData.userTx.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-white/40 py-4">Sem transações</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
