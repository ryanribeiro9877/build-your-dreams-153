import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useAuth } from "@/hooks/useAuth";
import { Coins, ArrowLeft, TrendingUp, TrendingDown, Gift, RefreshCw, Zap, ShoppingCart, Info, X, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { HexagonLoader } from "@/components/HexagonLoader";

const TOKEN_PACKAGES = [
  { id: "tokens_500_price", amount: 500, price: "R$ 9,90", popular: false },
  { id: "tokens_2000_price", amount: 2000, price: "R$ 29,90", popular: true },
  { id: "tokens_5000_price", amount: 5000, price: "R$ 59,90", popular: false },
  { id: "tokens_15000_price", amount: 15000, price: "R$ 149,90", popular: false },
];

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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { tokenBalance, transactions, loading, fetchTransactions, fetchBalance } = useTokenBalance();
  const [loaded, setLoaded] = useState(false);
  const [checkoutPkg, setCheckoutPkg] = useState<typeof TOKEN_PACKAGES[0] | null>(null);
  const checkoutSuccess = searchParams.get("checkout") === "success";

  useEffect(() => {
    if (!loaded) {
      fetchTransactions();
      setLoaded(true);
    }
  }, [loaded, fetchTransactions]);

  // Auto-open the suggested package coming from low-balance alert
  useEffect(() => {
    const suggested = searchParams.get("suggested");
    if (suggested && !checkoutPkg) {
      const amt = parseInt(suggested, 10);
      const pkg = TOKEN_PACKAGES.find((p) => p.amount === amt);
      if (pkg) setCheckoutPkg(pkg);
    }
  }, [searchParams, checkoutPkg]);

  useEffect(() => {
    if (checkoutSuccess) {
      fetchBalance();
      fetchTransactions();
    }
  }, [checkoutSuccess, fetchBalance, fetchTransactions]);

  if (loading) {
    return <HexagonLoader variant="fullscreen" />;
  }

  return (
    <div className="min-h-screen bg-[#09090f] text-white">
      <PaymentTestModeBanner />
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/sistema")}
            className="shrink-0 gap-2 border-[#eab308] bg-[#eab308]/15 text-[#facc15] font-semibold hover:bg-[#eab308]/28 hover:text-[#fde047] hover:border-[#facc15] shadow-[0_0_12px_rgba(234,179,8,0.2)]"
            aria-label="Voltar ao sistema"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
            Voltar
          </Button>
          <Coins className="w-6 h-6 text-[#eab308]" />
          <h1 className="text-2xl font-bold text-[#eab308]">Meus Tokens</h1>
        </div>

        {/* Checkout success */}
        {checkoutSuccess && (
          <Card className="bg-emerald-500/10 border-emerald-500/30">
            <CardContent className="flex items-center gap-3 py-4">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Pagamento realizado com sucesso! Seus tokens foram adicionados ao saldo.</span>
            </CardContent>
          </Card>
        )}

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

        {/* Stripe Checkout Overlay */}
        {checkoutPkg && (
          <Card className="bg-[#1a1a2e] border-[#c9a84c]/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#c9a84c]">Recarga de {checkoutPkg.amount.toLocaleString()} tokens</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCheckoutPkg(null)} className="text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent>
              <StripeEmbeddedCheckout
                priceId={checkoutPkg.id}
                customerEmail={user?.email || undefined}
                userId={user?.id}
                tokenAmount={checkoutPkg.amount}
                returnUrl={`${window.location.origin}/tokens?checkout=success&session_id={CHECKOUT_SESSION_ID}`}
              />
            </CardContent>
          </Card>
        )}

        {/* Recharge Packages */}
        {!checkoutPkg && (
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
                    onClick={() => setCheckoutPkg(pkg)}
                  >
                    {pkg.popular && (
                      <span className="absolute -top-2 right-2 bg-[#c9a84c] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">Popular</span>
                    )}
                    <div className="text-2xl font-bold text-white">{pkg.amount.toLocaleString()}</div>
                    <div className="text-xs text-white/50">tokens</div>
                    <div className="text-lg font-semibold text-[#c9a84c] mt-2">{pkg.price}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
