
-- Create enum types
CREATE TYPE public.agent_role AS ENUM ('director', 'orchestrator', 'manager', 'specialist', 'reviewer', 'executor', 'monitor');
CREATE TYPE public.agent_status AS ENUM ('active', 'idle', 'alert', 'offline');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'review', 'approved', 'rejected', 'completed', 'cancelled');
CREATE TYPE public.task_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.permission_type AS ENUM ('read', 'write', 'approve', 'execute', 'admin', 'monitor', 'schedule', 'contact_client', 'protocol', 'calculate', 'review_calculation', 'petition', 'market_study');

-- Departments table
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agents table
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🤖',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  role agent_role NOT NULL DEFAULT 'executor',
  status agent_status NOT NULL DEFAULT 'idle',
  can_orchestrate BOOLEAN NOT NULL DEFAULT false,
  max_concurrent_tasks INTEGER NOT NULL DEFAULT 5,
  current_tasks INTEGER NOT NULL DEFAULT 0,
  max_processes_monitored INTEGER DEFAULT 50,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agent permissions table
CREATE TABLE public.agent_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  permission permission_type NOT NULL,
  granted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, permission)
);

-- Processes table
CREATE TABLE public.processes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  responsible_lawyer TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  description TEXT,
  next_hearing_date TIMESTAMP WITH TIME ZONE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agent tasks table
CREATE TABLE public.agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  process_id UUID REFERENCES public.processes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'general',
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',
  assigned_by UUID,
  reviewed_by UUID,
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agent messages (chat history)
CREATE TABLE public.agent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL DEFAULT 'agent',
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Orchestration log
CREATE TABLE public.agent_orchestration_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  to_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  task_id UUID REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_orchestration_log ENABLE ROW LEVEL SECURITY;

-- Departments: readable by all authenticated, writable by authenticated
CREATE POLICY "Authenticated users can view departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage departments" ON public.departments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agents: readable by all authenticated, writable by authenticated
CREATE POLICY "Authenticated users can view agents" ON public.agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage agents" ON public.agents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agent permissions: readable by all authenticated
CREATE POLICY "Authenticated users can view permissions" ON public.agent_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage permissions" ON public.agent_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Processes: users can only access their own
CREATE POLICY "Users can view own processes" ON public.processes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own processes" ON public.processes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own processes" ON public.processes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own processes" ON public.processes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Tasks: users can only access their own
CREATE POLICY "Users can view own tasks" ON public.agent_tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own tasks" ON public.agent_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON public.agent_tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON public.agent_tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Messages: users can only access their own
CREATE POLICY "Users can view own messages" ON public.agent_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own messages" ON public.agent_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Orchestration log: readable by all authenticated
CREATE POLICY "Authenticated users can view orchestration logs" ON public.agent_orchestration_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create orchestration logs" ON public.agent_orchestration_log FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_orchestration_log;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_processes_updated_at BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_tasks_updated_at BEFORE UPDATE ON public.agent_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_agents_department ON public.agents(department_id);
CREATE INDEX idx_agents_role ON public.agents(role);
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_agent_tasks_agent ON public.agent_tasks(agent_id);
CREATE INDEX idx_agent_tasks_status ON public.agent_tasks(status);
CREATE INDEX idx_agent_tasks_process ON public.agent_tasks(process_id);
CREATE INDEX idx_agent_messages_department ON public.agent_messages(department_id);
CREATE INDEX idx_processes_user ON public.processes(user_id);
CREATE INDEX idx_processes_department ON public.processes(department_id);
