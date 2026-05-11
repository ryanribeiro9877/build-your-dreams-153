-- Refund mechanism for failed/placeholder AI responses.
-- Strategy: keep consume_tokens unchanged but add refund_tokens with idempotency
-- via reference_id, so the client can charge upfront and refund if the AI
-- response fails or is rejected by the user.

CREATE OR REPLACE FUNCTION public.refund_tokens(
  p_user_id uuid,
  p_amount integer,
  p_reference_id text,
  p_description text DEFAULT 'Estorno: resposta nao entregue'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_refunded boolean;
BEGIN
  IF p_amount <= 0 THEN
    RETURN false;
  END IF;

  -- Idempotency: do not refund the same reference twice.
  SELECT EXISTS (
    SELECT 1 FROM public.token_transactions
    WHERE user_id = p_user_id
      AND reference_id = p_reference_id
      AND transaction_type = 'refund'
  ) INTO v_already_refunded;

  IF v_already_refunded THEN
    RETURN false;
  END IF;

  UPDATE public.token_balances
  SET balance = balance + p_amount,
      total_consumed = GREATEST(0, total_consumed - p_amount),
      updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description, reference_id)
  VALUES (p_user_id, p_amount, 'refund', p_description, p_reference_id);

  RETURN true;
END;
$$;

-- Allow authenticated user to refund only their own tokens via RLS-aware wrapper.
-- The SECURITY DEFINER above bypasses RLS but we enforce p_user_id == auth.uid()
-- through a stricter wrapper that the frontend will call.
CREATE OR REPLACE FUNCTION public.refund_own_tokens(
  p_amount integer,
  p_reference_id text,
  p_description text DEFAULT 'Estorno: resposta nao entregue'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.refund_tokens(v_uid, p_amount, p_reference_id, p_description);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_own_tokens(integer, text, text) TO authenticated;

-- Also enhance consume_tokens to accept an idempotency reference_id so the
-- frontend can correlate a charge with a later refund.
CREATE OR REPLACE FUNCTION public.consume_tokens_with_ref(
  p_user_id uuid,
  p_amount integer,
  p_description text,
  p_reference_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
BEGIN
  SELECT balance INTO current_balance FROM public.token_balances WHERE user_id = p_user_id FOR UPDATE;

  IF current_balance IS NULL OR current_balance < p_amount THEN
    RETURN false;
  END IF;

  UPDATE public.token_balances
  SET balance = balance - p_amount,
      total_consumed = total_consumed + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description, reference_id)
  VALUES (p_user_id, -p_amount, 'consumption', p_description, p_reference_id);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_tokens_with_ref(uuid, integer, text, text) TO authenticated;
