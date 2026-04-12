-- Add task_category column
ALTER TABLE public.agent_tasks 
ADD COLUMN IF NOT EXISTS task_category text NOT NULL DEFAULT 'confeccao';

-- Add client_name for display
ALTER TABLE public.agent_tasks
ADD COLUMN IF NOT EXISTS client_name text;

-- Add agent_name for display  
ALTER TABLE public.agent_tasks
ADD COLUMN IF NOT EXISTS agent_name text;

-- Enable realtime for clients and client_documents
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_documents;