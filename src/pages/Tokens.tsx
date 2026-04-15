import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useAuth } from "@/hooks/useAuth";
import { Coins, ArrowLeft, TrendingUp, TrendingDown, Gift, RefreshCw, Zap, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TOKEN_PACKAGES = [
  { id: "500", amount: 500, price: "R$ 9,90", popular: false },
  { id: "2000", amount: 2000, price: "R$ 29,90", popular: true },
  { id: "5000", amount: 5000, price: "R$ 59,90", popular: false },
  { id: "15000", amount: 15000, price: "R$ 149,90", popular: false },
];

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  purchase: { label: "Compra", icon: <ShoppingCart className="w-4 h-4" />, color: "text-emerald-400" },
  consumption: { label: "Consumo", icon: <Zap className="w-4 h-4" />, color: "text-orange-400" },
  bonus: { label: "Bônus", icon: <Gift className="w-4 h-4" />, color: "text-purple-400" },
  refund: { label: "Reembolso", icon: <RefreshCw className="w-4 h-4" />, color: "text-blue-400" },
};

export default function Tokens() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tokenBalance, transactions, loading, fetchTransactions } = useTokenBalance();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      fetchTransactions();
      setLoaded(true);
    }
  }, [loaded, fetchTransactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#09090f]">
        <Coins className="w-8 h-8 text-[#c9a84c] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090f] text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sistema")} className="text-[#c9a84c] hover:bg-[#c9a84c]/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Coins className="w-6 h-6 text-[#c9a84c]" />
          <h1 className="text-2xl font-bold text-[#c9a84c]">Meus Tokens</h1>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-[#c9a84c]/20 to-[#c9a84c]/5 border-[#c9a84c]/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#c9a84c]/80 flex items-center gap-2">
                <Coins className="w-4 h-4" /> Saldo Atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold text-[#c9a84c]">{tokenBalance.balance.toLocaleString()}</span>
              <span className="text-sm text-[#c9a84c]/60 ml-2">tokens</span>
            </CardContent>
          </Card>
          <Card className="bg-[#1a1a2e] border-emerald-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-emerald-400/80 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Total Adquirido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-emerald-400">{tokenBalance.totalPurchased.toLocaleString()}</span>
            </CardContent>
          </Card>
          <Card className="bg-[#1a1a2e] border-orange-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-400/80 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" /> Total Consumido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-orange-400">{tokenBalance.totalConsumed.toLocaleString()}</span>
            </CardContent>
          </Card>
        </div>

        {/* Recharge Packages */}
        <Card className="bg-[#1a1a2e] border-[#c9a84c]/20">
          <CardHeader>
            <CardTitle className="text-[#c9a84c] flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Recarregar Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TOKEN_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  className={`relative p-4 rounded-xl border transition-all hover:scale-105 ${
                    pkg.popular
                      ? "border-[#c9a84c] bg-[#c9a84c]/10 shadow-lg shadow-[#c9a84c]/10"
                      : "border-white/10 bg-white/5 hover:border-[#c9a84c]/50"
                  }`}
                  onClick={() => {
                    // TODO: Stripe checkout
                    alert(`Stripe checkout para ${pkg.amount} tokens será integrado em breve!`);
                  }}
                >
                  {pkg.popular && (
                    <Badge className="absolute -top-2 right-2 bg-[#c9a84c] text-black text-[10px]">Popular</Badge>
                  )}
                  <div className="text-2xl font-bold text-white">{pkg.amount.toLocaleString()}</div>
                  <div className="text-xs text-white/50">tokens</div>
                  <div className="text-lg font-semibold text-[#c9a84c] mt-2">{pkg.price}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card className="bg-[#1a1a2e] border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-[#c9a84c]" /> Histórico de Transações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-white/40 text-center py-8">Nenhuma transação encontrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/60">Tipo</TableHead>
                      <TableHead className="text-white/60">Descrição</TableHead>
                      <TableHead className="text-white/60 text-right">Tokens</TableHead>
                      <TableHead className="text-white/60 text-right">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const config = typeConfig[tx.transaction_type] || typeConfig.consumption;
                      return (
                        <TableRow key={tx.id} className="border-white/5">
                          <TableCell>
                            <span className={`flex items-center gap-2 ${config.color}`}>
                              {config.icon} {config.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-white/70">{tx.description || "—"}</TableCell>
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
