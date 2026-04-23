import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Coins, ArrowLeft, TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart, Zap, Gift, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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

// Conversão aproximada: R$ 9,90 / 500 tokens = R$ 0,0198 por token
const REVENUE_PER_TOKEN = 0.0198;

export default function AdminTokens() {
  const navigate = useNavigate();
  const { hasRole, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserStats[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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
      supabase.from("token_transactions").select("*").order("created_at", { ascending: false }).limit(200),
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

  // Aggregates
  const totalUsers = users.length;
  const totalPurchased = users.reduce((s, u) => s + u.total_purchased, 0);
  const totalConsumed = users.reduce((s, u) => s + u.total_consumed, 0);
  const totalBalance = users.reduce((s, u) => s + u.balance, 0);
  const totalRevenue = totalPurchased * REVENUE_PER_TOKEN;

  // 14-day consumption trend
  const trendData = (() => {
    const days: { date: string; consumido: number; comprado: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const dayTx = transactions.filter((t) => t.created_at.slice(0, 10) === key);
      const consumido = dayTx.filter((t) => t.transaction_type === "consumption").reduce((s, t) => s + Math.abs(t.amount), 0);
      const comprado = dayTx.filter((t) => t.transaction_type === "purchase").reduce((s, t) => s + t.amount, 0);
      days.push({ date: label, consumido, comprado });
    }
    return days;
  })();

  const typeIcon: Record<string, JSX.Element> = {
    purchase: <ShoppingCart className="w-4 h-4 text-emerald-400" />,
    consumption: <Zap className="w-4 h-4 text-orange-400" />,
    bonus: <Gift className="w-4 h-4 text-purple-400" />,
    refund: <RefreshCw className="w-4 h-4 text-blue-400" />,
  };

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

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-emerald-400/80 flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Receita Estimada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-emerald-400">
                R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-[#1a1a2e] border-[#c9a84c]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#c9a84c]/80 flex items-center gap-2">
                <Users className="w-4 h-4" /> Usuários Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-[#c9a84c]">{totalUsers}</span>
            </CardContent>
          </Card>
          <Card className="bg-[#1a1a2e] border-orange-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-400/80 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" /> Total Consumido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-orange-400">{totalConsumed.toLocaleString()}</span>
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
            <CardTitle className="text-[#c9a84c]">Tendência (últimos 14 dias)</CardTitle>
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
            <CardTitle className="text-[#c9a84c]">Top Usuários por Consumo</CardTitle>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.slice(0, 20).map((u) => (
                  <TableRow key={u.user_id} className="border-white/5">
                    <TableCell className="text-white">{u.display_name || u.user_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right font-mono text-[#c9a84c]">{u.balance.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">{u.total_purchased.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-orange-400">{u.total_consumed.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-300">
                      {(u.total_purchased * REVENUE_PER_TOKEN).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-6">Nenhum dado disponível</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="bg-[#1a1a2e] border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Últimas Transações</CardTitle>
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
                  {transactions.slice(0, 50).map((tx) => {
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
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
