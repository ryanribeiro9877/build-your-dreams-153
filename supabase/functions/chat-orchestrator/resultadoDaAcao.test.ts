import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CHAVES_DE_NOTA, extrairNotasDoResultado, montarMensagemSucesso, resumoDoEfeito,
  serializarResultadoLeitura,
} from "./resultadoDaAcao.ts";

/* Todo dado destes testes é FICTÍCIO (repo público): nomes inventados, processo
   com número claramente de teste e nenhum CPF/telefone. */

/* ─── A.2: o aviso não pode morrer no caminho ──────────────────────────────── */

Deno.test("extrai as 5 chaves escalares em ordem estável", () => {
  const r = {
    ok: true, mensagem: "M", limitacao: "L", nota_tipo: "NT", nota: "N", aviso: "A",
  };
  assertEquals(extrairNotasDoResultado(r), ["A", "N", "NT", "L", "M"]);
  // A ordem declarada é a ordem de exibição.
  assertEquals([...CHAVES_DE_NOTA], ["aviso", "nota", "nota_tipo", "limitacao", "mensagem"]);
});

Deno.test("J-01: o aviso da diligência-ponte chega à resposta", () => {
  const r = {
    ok: true, diligencia_id: "11111111-1111-1111-1111-111111111111",
    tipo: "balcao_virtual", processo: "0000000-00.0000.0.00.0000",
    processo_vinculado: false, pendencia_prazo_criada: true,
    aviso: "Processo ainda não cadastrado no sistema — diligência guardada pelo número. Vincular quando o processo for criado.",
  };
  const msg = montarMensagemSucesso("registrar_diligencia", r);
  assert(msg.includes("Processo ainda não cadastrado no sistema"), msg);
  // E a frase de sucesso não pode afirmar vínculo que não existe.
  assert(!/registrada no processo/.test(msg), msg);
  assert(msg.includes("guardada pelo número"), msg);
});

Deno.test("notas (array dos handlers do P2) entram e não repetem o aviso", () => {
  const r = {
    ok: true, aviso: "AVISO X",
    notas: ["AVISO X", "Sem prazo informado, então NÃO nasceu pendência.", "AVISO X"],
  };
  assertEquals(extrairNotasDoResultado(r), [
    "AVISO X", "Sem prazo informado, então NÃO nasceu pendência.",
  ]);
});

Deno.test("vazio/espaços/não-string não viram nota", () => {
  assertEquals(extrairNotasDoResultado({ aviso: "", nota: "   ", nota_tipo: null, limitacao: 7 }), []);
  assertEquals(extrairNotasDoResultado({ notas: ["", "  ", null, 3, "ok"] }), ["ok"]);
});

Deno.test("entrada inválida nunca lança", () => {
  assertEquals(extrairNotasDoResultado(null), []);
  assertEquals(extrairNotasDoResultado(undefined), []);
  assertEquals(extrairNotasDoResultado("texto"), []);
  assertEquals(extrairNotasDoResultado([1, 2]), []);
  assertEquals(resumoDoEfeito("registrar_diligencia", null), null);
});

Deno.test("teto de 8 notas (não despeja resultado gigante no chat)", () => {
  const notas = Array.from({ length: 20 }, (_, i) => `nota ${i}`);
  assertEquals(extrairNotasDoResultado({ notas }).length, 8);
});

/* ─── A.3: o resumo tem de dizer O QUÊ, com número ─────────────────────────── */

Deno.test("A-01: relação bancária diz que o produto NÃO duplica", () => {
  const comProduto = resumoDoEfeito("registrar_relacao_bancaria", {
    ok: true, cliente: "Cliente Ficticio Um", relation_id: "22222222-2222-2222-2222-222222222222",
  })!;
  assert(comProduto.includes("Cliente Ficticio Um"), comProduto);
  assert(/não cria um segundo|não duplica/.test(comProduto), comProduto);
  // Só banco do benefício (sem relation_id) tem de dizer que NÃO houve produto.
  const soBeneficio = resumoDoEfeito("registrar_relacao_bancaria", {
    ok: true, cliente: "Cliente Ficticio Um", relation_id: null,
  })!;
  assert(soBeneficio.includes("banco do benefício"), soBeneficio);
  assert(soBeneficio.includes("nenhum produto"), soBeneficio);
});

Deno.test("B-05: pendência de recuperação DEDUPLICADA é dita, não escondida", () => {
  const criou = resumoDoEfeito("atualizar_status_credencial_gov", {
    ok: true, cliente: "Cliente Ficticio Dois", status_acesso: "invalido",
    pendencia_recuperacao_criada: true,
  })!;
  assert(criou.includes("Pendência de recuperação de senha criada."), criou);
  const deduplicou = resumoDoEfeito("atualizar_status_credencial_gov", {
    ok: true, cliente: "Cliente Ficticio Dois", status_acesso: "invalido",
    pendencia_recuperacao_criada: false,
  })!;
  assert(/Já havia uma pendência de recuperação aberta/.test(deduplicou), deduplicou);
  // status que NÃO gera pendência não pode ganhar nenhuma das duas frases.
  const valido = resumoDoEfeito("atualizar_status_credencial_gov", {
    ok: true, cliente: "Cliente Ficticio Dois", status_acesso: "valido",
    pendencia_recuperacao_criada: false,
  })!;
  assert(!/pend[êe]ncia/i.test(valido), valido);
});

Deno.test("contadores aparecem com NÚMERO", () => {
  assert(resumoDoEfeito("criar_campanha", { campanha_id: "x", nome: "Fila Teste", clientes: 0 })!
    .includes("0 cliente(s)"));
  assert(resumoDoEfeito("registrar_evento_processual", {
    ok: true, processo: "0000000-00.0000.0.00.0000", evento: "sentenca_procedente", prazos_criados: 2,
  })!.includes("2 prazo(s) criado(s)"));
  assert(resumoDoEfeito("gerar_campanha_renovacao_procuracao", {
    ok: true, nome: "Renovação Teste", clientes_na_fila: 3, sem_telefone: 1, janela_dias: 30,
  })!.includes("3 cliente(s) na fila"));
  assert(resumoDoEfeito("remarcar_revisao_execucao", {
    ok: true, processo: "0000000-00.0000.0.00.0000", proxima_revisao: "2026-08-20", pendencias_fechadas: 1,
  })!.includes("1 pendência(s)"));
});

Deno.test("atualizar_apolice com 0 campos NÃO diz 'atualizada'", () => {
  const zero = resumoDoEfeito("atualizar_apolice", {
    ok: true, cliente: "Cliente Ficticio Tres", seguradora: "SEGURADORA EXEMPLO", campos_alterados: 0,
  })!;
  assert(zero.includes("Nenhum campo"), zero);
  assert(!/atualizada/.test(zero), zero);
  const um = resumoDoEfeito("atualizar_apolice", {
    ok: true, cliente: "Cliente Ficticio Tres", seguradora: "SEGURADORA EXEMPLO", campos_alterados: 1,
  })!;
  assert(um.includes("1 campo(s) alterado(s)"), um);
});

Deno.test("os TRÊS estados de `reconhecida` saem distintos", () => {
  const base = { ok: true, cliente: "Cliente Ficticio Quatro", seguradora: "SEGURADORA EXEMPLO" };
  assert(resumoDoEfeito("registrar_apolice", { ...base, reconhecida: false })!.includes("NÃO reconhece"));
  assert(resumoDoEfeito("registrar_apolice", { ...base, reconhecida: true })!.includes("Cliente reconhece"));
  assert(resumoDoEfeito("registrar_apolice", { ...base })!.includes("não informado"));
});

Deno.test("A.5: kit documental idempotente conta o que nasceu e o que já existia", () => {
  const misto = resumoDoEfeito("gerar_kit_documental", {
    ok: true, cliente: "Cliente Ficticio Oito", gerados: 1, ja_existiam: 3, falhas: [],
  })!;
  assert(misto.includes("1 documento(s) gerado(s) agora"), misto);
  assert(misto.includes("3 já existia(m)"), misto);
  assert(misto.includes("não dupliquei"), misto);
  // Repetição total: nada nasceu — e isso tem de aparecer.
  const nada = resumoDoEfeito("gerar_kit_documental", {
    ok: true, cliente: "Cliente Ficticio Oito", gerados: 0, ja_existiam: 4, falhas: [],
  })!;
  assert(!/gerado\(s\) agora/.test(nada), nada);
  assert(nada.includes("4 já existia(m)"), nada);
  // Falha parcial nunca some.
  const comFalha = resumoDoEfeito("gerar_kit_documental", {
    ok: false, cliente: "Cliente Ficticio Oito", gerados: 3, ja_existiam: 0,
    falhas: [{ documento: "Procuração", erro: "template ausente" }],
  })!;
  assert(comFalha.includes("1 documento(s) falharam"), comFalha);
});

Deno.test("nenhum UUID vaza para o texto (cláusula H)", () => {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const casos: Array<[string, Record<string, unknown>]> = [
    ["registrar_diligencia", { ok: true, diligencia_id: "33333333-3333-3333-3333-333333333333", tipo: "peticao", processo: "0001", processo_vinculado: true, pendencia_prazo_criada: true }],
    ["cumprir_diligencia", { ok: true, diligencia_id: "44444444-4444-4444-4444-444444444444", rediligencia_id: "55555555-5555-5555-5555-555555555555", rediligenciar_em: "2026-08-20", pendencia_fechada: true, protocolo: "BV-1" }],
    ["registrar_relacao_bancaria", { ok: true, cliente: "Cliente Ficticio Cinco", relation_id: "66666666-6666-6666-6666-666666666666" }],
    ["agendar_conversao_gov", { ok: true, cliente: "Cliente Ficticio Seis", pendencia_id: "77777777-7777-7777-7777-777777777777", nivel_atual: "bronze", ate: "2026-08-30" }],
    ["definir_permissao_menu", { user_id: "88888888-8888-8888-8888-888888888888", menu_key: "kanban", acao: "conceder" }],
  ];
  for (const [tool, r] of casos) {
    const s = resumoDoEfeito(tool, r);
    assert(s, `${tool} devia ter resumo`);
    assert(!UUID.test(s!), `${tool} vazou UUID: ${s}`);
  }
});

Deno.test("cumprir_diligencia sem protocolo não trata a falta como pendência", () => {
  const s = resumoDoEfeito("cumprir_diligencia", {
    ok: true, protocolo: null, sem_protocolo: true, pendencia_fechada: false,
  })!;
  assert(s.includes("sem número de protocolo"), s);
  assert(s.includes("não havia pendência de prazo"), s);
});

/* ─── Composição ───────────────────────────────────────────────────────────── */

Deno.test("tool sem contrato conhecido cai na INTENÇÃO, não na frase opaca", () => {
  const msg = montarMensagemSucesso("tool_desconhecida", { ok: true }, {
    intencao: "Criar pendência \"Conferir extrato\" (documentacao).",
  });
  assertEquals(msg, "Pronto — Criar pendência \"Conferir extrato\" (documentacao).");
});

Deno.test("intenção multilinha (cartão de cadastro) entra só na 1ª linha", () => {
  // humanSummary("cadastrar_cliente") é o cartão inteiro; save_client devolve só o
  // uuid, então não há efeito a ler — a cabeça vira a primeira linha da intenção.
  const msg = montarMensagemSucesso("cadastrar_cliente", "99999999-9999-9999-9999-999999999999", {
    intencao: "Cadastrar cliente: Cliente Ficticio Sete\nTipo: Pessoa física\nCPF: 123.***.***-45",
  });
  assertEquals(msg, "Pronto — Cadastrar cliente: Cliente Ficticio Sete");
});

Deno.test("sem efeito e sem intenção mantém a frase antiga (nunca fica sem resposta)", () => {
  assertEquals(
    montarMensagemSucesso("tool_desconhecida", { ok: true }),
    "Pronto — ação executada com sucesso.",
  );
});

Deno.test("notas viram bullets e o sufixo do orquestrador fica no fim", () => {
  const msg = montarMensagemSucesso("registrar_lembrete_audiencia", {
    ok: true, status: "nao_atendeu", nota: "Pendência permanece aberta para nova tentativa.",
  }, { sufixo: "Criei uma pendência para conferir o cadastro." });
  const linhas = msg.split("\n").filter(Boolean);
  assertEquals(linhas[0], "Lembrete da audiência registrado como nao atendeu.");
  assertEquals(linhas[1], "• Pendência permanece aberta para nova tentativa.");
  assertEquals(linhas[2], "Criei uma pendência para conferir o cadastro.");
});

/* ── serializarResultadoLeitura (achado da revisão de 04/08) ──────────────────
   As notas de tool de LEITURA se perdiam: o payload ia como
   JSON.stringify(data).slice(0,8000) cru, e as chaves de aviso ficam no FIM do
   jsonb — `limitacao` de preparar_audiencia ou o aviso de "veio a base inteira"
   desapareciam no corte. Agora vão na FRENTE. */

Deno.test("serializarResultadoLeitura: aviso vai na FRENTE do payload", () => {
  const s = serializarResultadoLeitura({ ok: true, itens: [1, 2], limitacao: "matriz incompleta (Card 12)" });
  assert(s.startsWith("AVISOS DESTE RESULTADO"), s.slice(0, 60));
  assert(s.includes("matriz incompleta"), s);
  assert(s.includes('"itens"'), s);
});

Deno.test("serializarResultadoLeitura: aviso SOBREVIVE quando o corpo é truncado", () => {
  // Corpo gigante: sem o prefixo, a chave `aviso` (no fim) morreria no corte.
  const grande = { ok: true, aviso: "veio a base INTEIRA, sem limite", lixo: "x".repeat(9000) };
  const s = serializarResultadoLeitura(grande, 500);
  assert(s.includes("veio a base INTEIRA"), s.slice(0, 120));
  assert(s.includes("[RESULTADO TRUNCADO]"), "precisa declarar o corte");
  assert(s.length <= 560, `tamanho ${s.length}`);
});

Deno.test("serializarResultadoLeitura: sem nota, é o JSON puro (nada de cabeçalho fantasma)", () => {
  const s = serializarResultadoLeitura({ ok: true, itens: [] });
  assertEquals(s, '{"ok":true,"itens":[]}');
});

Deno.test("serializarResultadoLeitura: resultado nulo não explode", () => {
  assertEquals(serializarResultadoLeitura(null), "null");
  assertEquals(serializarResultadoLeitura(undefined), "null");
});
