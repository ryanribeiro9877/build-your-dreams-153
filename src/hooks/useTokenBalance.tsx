import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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

export function useTokenBalance() {
  const { user } = useAuth();
  const [tokenBalance, setTokenBalance] = useState<TokenBalance>({ balance: 0, totalPurchased: 0, totalConsumed: 0 });
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);

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
    }
    setLoading(false);
  }, [user]);

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
