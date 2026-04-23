import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface TokenBalance {
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
}

interface TokenTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

const LOW_BALANCE_THRESHOLD = 10;
const CRITICAL_BALANCE_THRESHOLD = 0;

export function useTokenBalance() {
  const { user } = useAuth();
  const [tokenBalance, setTokenBalance] = useState<TokenBalance>({ balance: 0, totalPurchased: 0, totalConsumed: 0 });
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const lastWarnedRef = useRef<number | null>(null);

  const checkLowBalance = useCallback((balance: number) => {
    // Avoid duplicate toasts: only warn when crossing threshold downward
    const last = lastWarnedRef.current;
    if (balance <= CRITICAL_BALANCE_THRESHOLD && last !== 0) {
      toast.error("Saldo zerado!", {
        description: "Recarregue tokens para continuar usando os agentes.",
        action: { label: "Recarregar", onClick: () => (window.location.href = "/tokens") },
        duration: 8000,
      });
      lastWarnedRef.current = 0;
    } else if (balance > 0 && balance < LOW_BALANCE_THRESHOLD && (last === null || last >= LOW_BALANCE_THRESHOLD)) {
      toast.warning(`Saldo baixo: ${balance} tokens restantes`, {
        description: "Considere recarregar para evitar interrupções.",
        action: { label: "Recarregar", onClick: () => (window.location.href = "/tokens") },
        duration: 6000,
      });
      lastWarnedRef.current = balance;
    } else if (balance >= LOW_BALANCE_THRESHOLD) {
      lastWarnedRef.current = balance;
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("token_balances")
      .select("balance, total_purchased, total_consumed")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setTokenBalance({
        balance: data.balance,
        totalPurchased: data.total_purchased,
        totalConsumed: data.total_consumed,
      });
      checkLowBalance(data.balance);
    }
    setLoading(false);
  }, [user, checkLowBalance]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("token_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setTransactions(data as TokenTransaction[]);
  }, [user]);

  const consumeTokens = useCallback(async (amount: number, description: string = "Mensagem enviada") => {
    if (!user) return false;
    const { data, error } = await supabase.rpc("consume_tokens", {
      p_user_id: user.id,
      p_amount: amount,
      p_description: description,
    });
    if (error || !data) return false;
    await fetchBalance();
    return true;
  }, [user, fetchBalance]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { tokenBalance, transactions, loading, consumeTokens, fetchBalance, fetchTransactions };
}
