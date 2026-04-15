import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useAuth } from "@/hooks/useAuth";
import { Coins, ArrowLeft, TrendingUp, TrendingDown, Gift, RefreshCw, Zap, ShoppingCart, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PRICING_TIERS = [
  { action: "Comando simples", examples: "Ver prazos, avisar cliente, abrir fila", cost: 1 },
  { action: "Pesquisa jurídica", examples: "Resumir caso, jurisprudência, auditoria, relatório", cost: 5 },
  { action: "Geração de petição", examples: "Gerar petição inicial, redigir documento", cost: 10 },
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

        {/* Token Pricing */}
        <Card className="bg-[#1a1a2e] border-[#c9a84c]/20">
          <CardHeader>
            <CardTitle className="text-[#c9a84c] flex items-center gap-2">
              <Info className="w-5 h-5" /> Tabela de Consumo por Token
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Tipo de Ação</TableHead>
                  <TableHead className="text-white/60">Exemplos</TableHead>
                  <TableHead className="text-white/60 text-right">Custo (tokens)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PRICING_TIERS.map((tier) => (
                  <TableRow key={tier.action} className="border-white/5">
                    <TableCell className="font-medium text-white">{tier.action}</TableCell>
                    <TableCell className="text-white/50 text-xs">{tier.examples}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-[#c9a84c] font-bold text-lg">{tier.cost}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recharge CTA */}
        <Card className="bg-gradient-to-r from-[#c9a84c]/10 to-[#c9a84c]/5 border-[#c9a84c]/30">
          <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 py-6">
            <div>
              <h3 className="text-lg font-bold text-[#c9a84c]">Precisa de mais tokens?</h3>
              <p className="text-white/50 text-sm">Recarregue seu saldo a qualquer momento. Pagamento seguro via Stripe.</p>
            </div>
            <Button
              className="bg-[#c9a84c] text-black hover:bg-[#b8973f] font-bold px-6"
              onClick={() => alert("Stripe checkout será ativado em breve!")}
            >
              <ShoppingCart className="w-4 h-4 mr-2" /> Recarregar Tokens
            </Button>
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
