-- FEAT-01: Pendência como objeto de 1ª classe, ESTENDENDO user_tasks (sem tabela nova).
-- Aditivo e seguro: novas colunas nullable + policy SELECT permissiva só para linhas
-- is_pendencia. Não altera/remove nada do que já existe.

-- 1. Colunas de pendência em user_tasks.
ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS is_pendencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pendencia_tipo text,
  ADD COLUMN IF NOT EXISTS pendencia_estado text,
  ADD COLUMN IF NOT EXISTS data_fatal date,
  ADD COLUMN IF NOT EXISTS origem_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS origem_departamento public.org_stage,
  ADD COLUMN IF NOT EXISTS departamento_atual public.org_stage;

-- CHECKs (nullable: só validam quando preenchido).
DO $$ BEGIN
  ALTER TABLE public.user_tasks ADD CONSTRAINT user_tasks_pendencia_tipo_chk
    CHECK (pendencia_tipo IS NULL OR pendencia_tipo IN
      ('documentacao','comprovante_endereco','senha_inss','reset_inss','extratos',
       'falta_documentacao','audiencia','reuniao','andamento','whatsapp','outro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.user_tasks ADD CONSTRAINT user_tasks_pendencia_estado_chk
    CHECK (pendencia_estado IS NULL OR pendencia_estado IN
      ('aberta','em_tratamento','resolvida','devolvida','cancelada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_user_tasks_pendencia ON public.user_tasks(is_pendencia) WHERE is_pendencia;
CREATE INDEX IF NOT EXISTS idx_user_tasks_data_fatal ON public.user_tasks(data_fatal) WHERE is_pendencia AND data_fatal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_tasks_dep_atual ON public.user_tasks(departamento_atual) WHERE is_pendencia;

-- 2. RLS: policy SELECT ADICIONAL só para linhas de pendência (amplia visibilidade
--    sem mexer nas policies atuais de user_tasks). Permissiva (OR com as existentes).
DO $$ BEGIN
  CREATE POLICY "pendencia visibilidade por papel/origem/departamento" ON public.user_tasks
    FOR SELECT TO authenticated
    USING (
      is_pendencia = true AND (
        public.is_master_admin(auth.uid())
        OR public.has_role(auth.uid(), 'tech')
        OR auth.uid() = assignee_user_id
        OR auth.uid() = assigner_user_id
        OR auth.uid() = origem_user_id
        OR (
          departamento_atual IN ('recepcao','recepcao_supervisionada','kanban_pendencias')
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.role_templates rt ON rt.id = p.role_template_id
            WHERE p.user_id = auth.uid()
              AND rt.code IN ('recepcionista','lider_recepcao','estagiaria_recepcao','socio')
          )
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
