
-- Fix overly permissive policies on clients
DROP POLICY IF EXISTS "Authenticated can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can delete documents" ON public.client_documents;

-- More restrictive: only users with appropriate roles can update/delete
CREATE POLICY "Role-based update clients" ON public.clients FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'lawyer') OR
    public.has_role(auth.uid(), 'director') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Role-based delete clients" ON public.clients FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'lawyer') OR
    public.has_role(auth.uid(), 'director')
  );

CREATE POLICY "Role-based delete documents" ON public.client_documents FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'lawyer') OR
    public.has_role(auth.uid(), 'director')
  );
