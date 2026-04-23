
CREATE POLICY "Admins can view all balances"
ON public.token_balances
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all transactions"
ON public.token_transactions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
