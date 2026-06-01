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

const DEFAULT_LOW_BALANCE_THRESHOLD = 10;
const THRESHOLD_STORAGE_KEY = "lowBalanceThreshold";
// Sessionsto storage so the warning re-triggers in a new browser session/tab cycle
const WARNED_LOW_KEY = "lowBalanceWarned";
const WARNED_ZERO_KEY = "zeroBalanceWarned";

export function getLowBalanceThreshold(): number {
  if (typeof window === "undefined") return DEFAULT_LOW_BALANCE_THRESHOLD;
  const stored = window.localStorage.getItem(THRESHOLD_STORAGE_KEY);
  const n = stored ? parseInt(stored, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOW_BALANCE_THRESHOLD;
}

export function setLowBalanceThreshold(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(Math.max(0, Math.floor(value))));
  // Reset session warnings so the new threshold can warn again
  window.sessionStorage.removeItem(WARNED_LOW_KEY);
  window.sessionStorage.removeItem(WARNED_ZERO_KEY);
}

/** Suggest a recharge package based on current balance — picks the smallest tier that
 *  comfortably covers a typical workload, escalating with deficit. */
export function suggestRechargePackage(balance: number): { amount: number; query: string } {
  if (balance <= 0) return { amount: 2000, query: "?suggested=2000" };
  if (balance < 50) return { amount: 500, query: "?suggested=500" };
  if (balance < 200) return { amount: 2000, query: "?suggested=2000" };
  return { amount: 5000, query: "?suggested=5000" };
}

export function useTokenBalance(navigate?: (to: string) => void) {
  const { user } = useAuth();
  const [tokenBalance, setTokenBalance] = useState<TokenBalance>({ balance: 0, totalPurchased: 0, totalConsumed: 0 });
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const warnedThisRenderRef = useRef(false);

  const checkLowBalance = useCallback((balance: number) => {
    if (typeof window === "undefined") return;
    const threshold = getLowBalanceThreshold();
    const zeroWarned = window.sessionStorage.getItem(WARNED_ZERO_KEY) === "1";
    const lowWarned = window.sessionStorage.getItem(WARNED_LOW_KEY) === "1";

    const goRecharge = () => {
      const { query } = suggestRechargePackage(balance);
      if (navigate) {
        navigate(`/tokens${query}`);
      } else {
        window.location.href = `/tokens${query}`;
      }
    };

    if (balance <= 0 && !zeroWarned) {
      const { amount } = suggestRechargePackage(balance);
      toast.error("Saldo zerado!", {
        description: `Recarregue tokens para continuar. Sugestão: pacote de ${amount.toLocaleString()} tokens.`,
        action: { label: "Recarregar", onClick: goRecharge },
        duration: 10000,
      });
      window.sessionStorage.setItem(WARNED_ZERO_KEY, "1");
    } else if (balance > 0 && balance < threshold && !lowWarned) {
      const { amount } = suggestRechargePackage(balance);
      toast.warning(`Saldo baixo: ${balance} tokens restantes`, {
        description: `Limite de aviso: ${threshold}. Sugerimos o pacote de ${amount.toLocaleString()} tokens.`,
        action: { label: "Recarregar agora", onClick: goRecharge },
        duration: 8000,
      });
      window.sessionStorage.setItem(WARNED_LOW_KEY, "1");
    } else if (balance >= threshold) {
      // Reset warnings when balance recovers above threshold
      window.sessionStorage.removeItem(WARNED_LOW_KEY);
      window.sessionStorage.removeItem(WARNED_ZERO_KEY);
    }
  }, [navigate]);

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
      if (!warnedThisRenderRef.current) {
        warnedThisRenderRef.current = true;
        checkLowBalance(data.balance);
      } else {
        // After consumption events still allow re-evaluation, but session flags gate duplicates
        checkLowBalance(data.balance);
      }
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

  // Charge with a reference_id so a later refund can be tied to this request.
  const consumeTokensWithRef = useCallback(async (amount: number, description: string, referenceId: string) => {
    if (!user) return false;
    const { data, error } = await supabase.rpc("consume_tokens_with_ref" as never, {
      p_user_id: user.id,
      p_amount: amount,
      p_description: description,
      p_reference_id: referenceId,
    } as never);
    if (error || !data) return false;
    await fetchBalance();
    return true;
  }, [user, fetchBalance]);

  // Refund tokens for a failed/placeholder response. Idempotent on referenceId.
  const refundTokens = useCallback(async (amount: number, referenceId: string, description: string = "Estorno: resposta nao entregue") => {
    if (!user) return false;
    const { data, error } = await supabase.rpc("refund_own_tokens" as never, {
      p_amount: amount,
      p_reference_id: referenceId,
      p_description: description,
    } as never);
    if (error || !data) return false;
    await fetchBalance();
    return true;
  }, [user, fetchBalance]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { tokenBalance, transactions, loading, consumeTokens, consumeTokensWithRef, refundTokens, fetchBalance, fetchTransactions };
}
