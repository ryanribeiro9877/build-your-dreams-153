
-- Token balances table
CREATE TABLE public.token_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  total_consumed integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.token_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance"
  ON public.token_balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Token transactions table
CREATE TYPE public.token_transaction_type AS ENUM ('purchase', 'consumption', 'bonus', 'refund');

CREATE TABLE public.token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  transaction_type public.token_transaction_type NOT NULL,
  description text,
  reference_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.token_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to consume tokens (called from edge functions or client with service role)
CREATE OR REPLACE FUNCTION public.consume_tokens(p_user_id uuid, p_amount integer, p_description text DEFAULT 'Mensagem enviada')
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
  
  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description)
  VALUES (p_user_id, -p_amount, 'consumption', p_description);
  
  RETURN true;
END;
$$;

-- Function to add tokens (purchase/bonus)
CREATE OR REPLACE FUNCTION public.add_tokens(p_user_id uuid, p_amount integer, p_type token_transaction_type DEFAULT 'purchase', p_description text DEFAULT 'Recarga de tokens', p_reference_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.token_balances (user_id, balance, total_purchased)
  VALUES (p_user_id, p_amount, CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = token_balances.balance + p_amount,
      total_purchased = token_balances.total_purchased + CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
      updated_at = now();
  
  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description, reference_id)
  VALUES (p_user_id, p_amount, p_type, p_description, p_reference_id);
END;
$$;

-- Auto-create balance for new users (bonus of 100 tokens)
CREATE OR REPLACE FUNCTION public.handle_new_user_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.token_balances (user_id, balance, total_purchased)
  VALUES (NEW.id, 100, 0);
  
  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description)
  VALUES (NEW.id, 100, 'bonus', 'Bônus de boas-vindas');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_tokens
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_tokens();
