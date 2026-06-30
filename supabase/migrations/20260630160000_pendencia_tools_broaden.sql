-- Smoke fix #1: o seed por padrão de nome era estreito demais — especialistas de
-- recepção que recebem pedidos de pendência (ex.: "Documentação Geral", "Demandas
-- Administrativas") ficaram SEM allowed_tools e só NARRAVAM. Corrige dando o conjunto
-- operacional a TODOS os especialistas/monitores NÃO-redatores, para que qualquer um
-- que o roteador escolha consiga de fato chamar a tool. Redatores (modo segmentado,
-- max_tokens alto) ficam fora — eles nem entram no loop de ferramentas.
-- allowed_tools é lido em runtime pelo edge → efeito imediato, sem redeploy.

UPDATE public.agents
SET allowed_tools = ARRAY[
  'consultar_cliente','consultar_usuario','consultar_tarefas','consultar_documentos',
  'cadastrar_cliente','solicitar_documentos','pedir_acesso_arquivos',
  'criar_pendencia','transferir_pendencia','resolver_pendencia','agendar_reuniao'
]
WHERE role IN ('specialist','monitor')
  AND COALESCE(max_tokens, 0) < 12000;
