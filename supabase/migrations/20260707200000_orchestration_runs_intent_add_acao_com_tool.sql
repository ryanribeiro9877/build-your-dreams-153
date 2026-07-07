-- 20260707200000_orchestration_runs_intent_add_acao_com_tool.sql
--
-- CHAT-ACAO — reconciliação do repo com o banco (fonte de verdade).
-- A constraint de intent_category de orchestration_runs JÁ foi aplicada no banco
-- (aceitando 'ACAO_COM_TOOL' e 'CONSULTA'); este arquivo apenas registra a mudança
-- no repositório para manter migrations ↔ banco sincronizados. Idempotente.
--
-- Contexto: o classificador de intenção voltou a emitir 'ACAO_COM_TOOL' (ações
-- operacionais de escrita: cadastrar cliente, criar tarefa/pendência, etc.), que
-- roteiam pela cadeia com N3+tools por um caminho curto. Sem esta categoria no CHECK,
-- o INSERT do run falharia. 'CONSULTA' (leitura) também consta. Os rótulos legados
-- 'NEGOCIO' e 'INCERTO' são mantidos por compatibilidade com runs/históricos antigos.

alter table public.orchestration_runs
  drop constraint if exists orchestration_runs_intent_category_chk;

alter table public.orchestration_runs
  add constraint orchestration_runs_intent_category_chk
  check (
    intent_category is null
    or intent_category = any (array[
      'TRIVIAL','CONSULTA','NEGOCIO_SEM_INSUMO','NEGOCIO_COM_INSUMO',
      'NEGOCIO','INCERTO','ACAO_COM_TOOL'
    ])
  );
