import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { pickAgentForTool, type AgentLike } from "./pickAgent.ts";

const ag = (name: string, role: string, tools: string[]): AgentLike =>
  ({ id: name, name, role, allowed_tools: tools });

// Cenário REAL da Kailane (lido do banco em 27/07): o "Meu Assistente" porta a
// credencial e consultar_cliente, mas NÃO porta atualizar_cliente; o Especialista
// Cadastro porta as três.
const MEU_ASSISTENTE = ag("Meu Assistente", "assistant_root", ["registrar_credencial_gov", "consultar_cliente", "consultar_tarefas"]);
const CADASTRO = ag("Especialista Cadastro", "specialist", ["registrar_credencial_gov", "consultar_cliente", "atualizar_cliente", "gerar_kit_documental"]);
const CADASTRO_RASCUNHO = ag("Especialista Cadastro (Rascunho)", "specialist", ["registrar_credencial_gov", "consultar_cliente", "atualizar_cliente"]);
const KANBAN = ag("Especialista Kanban de Pendências", "specialist", ["atualizar_tarefa", "consultar_tarefas"]);
const DISTRIBUICAO = ag("Especialista Distribuição", "specialist", ["criar_processo", "consultar_cliente"]);

Deno.test("sem tools de apoio, o assistant_root é o alvo (estável)", () => {
  const a = pickAgentForTool([MEU_ASSISTENTE, CADASTRO], [], "registrar_credencial_gov");
  assertEquals(a?.name, "Meu Assistente");
});

// O CASO DO INCIDENTE: pedido composto exige atualizar_cliente. O assistant_root não
// tem → o turno deve ir ao Especialista Cadastro, não ficar com quem recusaria.
Deno.test("com apoio que o root NÃO tem, vai para o especialista completo", () => {
  const a = pickAgentForTool([MEU_ASSISTENTE, CADASTRO], [], "registrar_credencial_gov",
    ["consultar_cliente", "atualizar_cliente"]);
  assertEquals(a?.name, "Especialista Cadastro");
});

Deno.test("entre especialistas completos, o líder vence o '(Rascunho)'", () => {
  const a = pickAgentForTool([CADASTRO_RASCUNHO, CADASTRO], [], "registrar_credencial_gov",
    ["consultar_cliente", "atualizar_cliente"]);
  assertEquals(a?.name, "Especialista Cadastro");
});

Deno.test("root que cobre o kit continua preferido a especialista que também cobre", () => {
  const rootCompleto = ag("Meu Assistente", "assistant_root", ["registrar_credencial_gov", "consultar_cliente", "atualizar_cliente"]);
  const a = pickAgentForTool([rootCompleto, CADASTRO], [], "registrar_credencial_gov",
    ["consultar_cliente", "atualizar_cliente"]);
  assertEquals(a?.name, "Meu Assistente");
});

Deno.test("ninguém cobre tudo: fica com o root (não devolve null)", () => {
  const a = pickAgentForTool([MEU_ASSISTENTE], [], "registrar_credencial_gov",
    ["consultar_cliente", "atualizar_cliente"]);
  assertEquals(a?.name, "Meu Assistente");
});

Deno.test("sem root, escolhe o especialista de MELHOR cobertura", () => {
  const parcial = ag("Especialista Documentação Geral", "specialist", ["registrar_credencial_gov", "consultar_cliente"]);
  const a = pickAgentForTool([parcial, CADASTRO], [], "registrar_credencial_gov",
    ["consultar_cliente", "atualizar_cliente"]);
  assertEquals(a?.name, "Especialista Cadastro");
});

Deno.test("cai nos GLOBAIS quando o pool do usuário não porta a tool", () => {
  const a = pickAgentForTool([KANBAN], [DISTRIBUICAO], "criar_processo", ["consultar_cliente"]);
  assertEquals(a?.name, "Especialista Distribuição");
});

Deno.test("ninguém porta a tool em lugar nenhum → null (recusa pelo motivo real)", () => {
  assertEquals(pickAgentForTool([KANBAN], [], "registrar_credencial_gov", []), null);
  assertEquals(pickAgentForTool([], [], "qualquer_tool"), null);
});

Deno.test("objeto de tarefa continua no Kanban (não regride)", () => {
  const a = pickAgentForTool([MEU_ASSISTENTE, KANBAN], [], "atualizar_tarefa", ["consultar_tarefas"]);
  assertEquals(a?.name, "Especialista Kanban de Pendências");
});
