
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM (
  'admin', 'director', 'manager', 'lawyer', 'receptionist', 
  'intern', 'financial', 'marketing', 'protocol', 'calculator', 'compliance'
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  job_title TEXT,
  department TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE POLICY "Authenticated users can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  responsible_lawyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated can update clients" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete clients" ON public.clients FOR DELETE TO authenticated USING (true);

-- Client documents table
CREATE TABLE public.client_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'outro',
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  notes TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view documents" ON public.client_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can upload documents" ON public.client_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Authenticated can delete documents" ON public.client_documents FOR DELETE TO authenticated USING (true);

-- Storage bucket for client documents
INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false);

CREATE POLICY "Authenticated can upload client docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-documents');
CREATE POLICY "Authenticated can view client docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'client-documents');
CREATE POLICY "Authenticated can delete client docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'client-documents');

-- Indexes
CREATE INDEX idx_clients_cpf ON public.clients(cpf);
CREATE INDEX idx_clients_created_by ON public.clients(created_by);
CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_client_documents_client ON public.client_documents(client_id);
CREATE INDEX idx_client_documents_type ON public.client_documents(document_type);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
