# CADASTRO-MODELO-A-REFINO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar o `ClienteFormWizard` e o painel pós-cadastro (`ClientDocumentsPhase`) — pontos 1–6 — e construir o Resolvedor de cliente (base do ponto 7).

**Architecture:** Mudanças de front concentradas em `src/components/clients/ClienteFormWizard.tsx`, `src/lib/clientDocuments.ts` e `src/styles/clientes.css`. Fiação de status usa colunas já existentes de `client_documents` (sem `db push`). O Resolvedor é lógica pura Deno em `supabase/functions/chat-orchestrator/clientResolver.ts`, sem consumidor visível ainda (base do ponto 7).

**Tech Stack:** React 18 + TS + Vite; Supabase JS; Deno (edge); Vitest (front) / Deno test (edge).

## Global Constraints

- Sem `db push` (R-2) — usar só colunas existentes de `client_documents` (`status` default `'pendente'`, CHECK `pendente|recebido|validado|rejeitado`; `origem` opcional).
- `document_type` gravado deve pertencer ao CHECK de produção (inclui `rg, comprovante, extrato_conta, extrato_ir, procuracao, contrato_honorarios, declaracao_hipossuficiencia, termo_cooperado`).
- `[A PREENCHER]` só para obrigatório realmente ausente; opcional "não possui" nunca vira `[A PREENCHER]`.
- Sem runtime Node local → **verificação de teste é via CI (push no PR)**, não `vitest` local. Cada tarefa termina em commit; PRs mergeados só com CI verde.
- Testes que importam módulos que puxam `@/integrations/supabase/client` precisam `vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }))` (o client estoura sem env no CI).

---

### Task 1: Generalizar `uploadClientDocument` (status/origem/documentType explícito)

**Files:**
- Modify: `src/lib/clientDocuments.ts`
- Test: `src/lib/clientDocuments.test.ts`

**Interfaces:**
- Produces: `uploadClientDocument(clientId, clientName, uploadedBy, { documentType, documentName, file, status?, origem? })` e mantém `uploadClientDocuments(clientId, clientName, uploadedBy, files)` para os slots (resolvendo `documentType` via `DOC_TYPE_BY_SLOT` e `status:'recebido'`). `DOC_TYPE_BY_SLOT` inalterado.

- [ ] **Step 1: Escrever teste do novo contrato** (append em `clientDocuments.test.ts`)

```ts
import { buildDocInsert } from "./clientDocuments";

describe("buildDocInsert — payload do insert em client_documents", () => {
  it("usa status recebido e origem recepcao por padrão", () => {
    const row = buildDocInsert("c1", "MARIA", "u1", {
      documentType: "rg", documentName: "RG — Frente", filePath: "c1/rg.png", fileSize: 10, mimeType: "image/png",
    });
    expect(row.document_type).toBe("rg");
    expect(row.status).toBe("recebido");
    expect(row.origem).toBe("recepcao");
    expect(row.client_id).toBe("c1");
  });
  it("respeita status explícito", () => {
    const row = buildDocInsert("c1", "MARIA", "u1", {
      documentType: "procuracao", documentName: "Procuração (assinada)", filePath: "c1/proc.pdf", fileSize: 1, mimeType: "application/pdf", status: "recebido",
    });
    expect(row.status).toBe("recebido");
  });
});
```

- [ ] **Step 2: Extrair `buildDocInsert` (pura) e usar status/origem**

Em `src/lib/clientDocuments.ts`, adicionar a função pura e refatorar o insert para usá-la, com `status`/`origem` (defaults `'recebido'`/`'recepcao'`):

```ts
export interface DocInsertInput {
  documentType: string; documentName: string; filePath: string;
  fileSize: number; mimeType: string; status?: string; origem?: string;
}

// Payload puro do insert em client_documents (testável sem rede).
export function buildDocInsert(
  clientId: string, clientName: string, uploadedBy: string, d: DocInsertInput,
) {
  return {
    client_id: clientId, client_name: clientName,
    document_type: d.documentType, document_name: d.documentName,
    file_path: d.filePath, file_size: d.fileSize, mime_type: d.mimeType,
    notes: null, uploaded_by: uploadedBy,
    status: d.status ?? "recebido", origem: d.origem ?? "recepcao",
  } as const;
}
```

Refatorar `uploadClientDocument` (slot) para montar via `buildDocInsert` (document_type = `DOC_TYPE_BY_SLOT[slot]`, status `'recebido'`) e o `.insert(buildDocInsert(...) as never)`.

- [ ] **Step 3: Adicionar `uploadSignedDocument` (para o ponto 6)**

```ts
// Upload de um documento GERADO já assinado (mesmo document_type do gerado).
export async function uploadSignedDocument(
  clientId: string, clientName: string, uploadedBy: string,
  documentType: string, documentLabel: string, file: File,
): Promise<{ ok: boolean; error?: string }> {
  const filePath = `${clientId}/${Date.now()}_assinado_${documentType}_${file.name}`;
  const { error: upErr } = await supabase.storage.from("client-documents").upload(filePath, file);
  if (upErr) return { ok: false, error: upErr.message };
  const { error: insErr } = await supabase.from("client_documents").insert(
    buildDocInsert(clientId, clientName, uploadedBy, {
      documentType, documentName: `${documentLabel} (assinado)`, filePath,
      fileSize: file.size, mimeType: file.type, status: "recebido", origem: "recepcao",
    }) as never,
  );
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}
```

- [ ] **Step 4: Commit**

```
git add src/lib/clientDocuments.ts src/lib/clientDocuments.test.ts
git commit -m "refactor(cadastro): buildDocInsert + status recebido + uploadSignedDocument"
```

---

### Task 2: Ponto 5 — botão "Enviado" + inputs desabilitados após envio

**Files:**
- Modify: `src/components/clients/ClienteFormWizard.tsx` (componente `ClientDocumentsPhase`, ~629-695)

**Interfaces:**
- Consumes: `uploadClientDocuments` (Task 1, agora grava `status='recebido'`).

- [ ] **Step 1: Estado de slots enviados**

Em `ClientDocumentsPhase`, adicionar:

```tsx
const [sentSlots, setSentSlots] = useState<Set<ClientDocSlot>>(new Set());
```

- [ ] **Step 2: Marcar enviados no `handleUpload`**

Após `const ok = results.filter(r => r.ok);` adicionar:

```tsx
if (ok.length) setSentSlots(prev => { const n = new Set(prev); ok.forEach(r => n.add(r.slot)); return n; });
```

- [ ] **Step 3: Desabilitar input do slot enviado + label do botão**

No `.map(CLIENT_DOC_SLOTS)`, no `<input type="file">`, acrescentar `disabled={sentSlots.has(slot)}` e, quando enviado, mostrar "✓ enviado" ao lado do nome. No botão, quando todos os slots com arquivo já foram enviados e não há novos selecionados: texto "Enviado" e `disabled`.

```tsx
const anyPendingSelection = Object.entries(files).some(([slot, f]) => f && !sentSlots.has(slot as ClientDocSlot));
// botão:
<button type="button" className="cli-btn" disabled={uploading || !anyPendingSelection}
  onClick={() => void handleUpload()}>
  {uploading ? "Enviando…" : anyPendingSelection ? "Enviar documentos" : "Enviado"}
</button>
```

- [ ] **Step 4: Commit**

```
git add src/components/clients/ClienteFormWizard.tsx
git commit -m "feat(cadastro): botao Enviado e inputs desabilitados apos upload"
```

---

### Task 3: Ponto 6 — slot de upload do assinado por documento gerado

**Files:**
- Modify: `src/components/clients/ClienteFormWizard.tsx` (`ClientDocumentsPhase`, bloco `okGenerated.map`, ~704-712)

**Interfaces:**
- Consumes: `uploadSignedDocument` (Task 1); `okGenerated` (itens `{ documentType, label, filePath, missing }`).

- [ ] **Step 1: Estado dos assinados enviados**

```tsx
const [signedSent, setSignedSent] = useState<Set<string>>(new Set()); // por documentType
const [signedBusy, setSignedBusy] = useState<string | null>(null);
```

- [ ] **Step 2: Handler de upload do assinado**

```tsx
async function handleSigned(documentType: string, label: string, file: File) {
  setSignedBusy(documentType);
  const r = await uploadSignedDocument(clientId, clientName, userId, documentType, label, file);
  setSignedBusy(null);
  if (r.ok) {
    setSignedSent(prev => new Set(prev).add(documentType));
    toast.success(`${label}: assinado recebido`);
    await reloadChecklist();
  } else {
    toast.error(`Falha ao anexar ${label}: ${r.error ?? ""}`);
  }
}
```

- [ ] **Step 3: Render do slot abaixo de cada chip gerado**

Dentro do `okGenerated.map(g => ( ... ))`, envolver o chip existente e adicionar abaixo:

```tsx
<div key={g.documentType} className="cli-doc-gen-item">
  <button type="button" className="cli-doc-chip" title="Baixar para revisão"
    onClick={() => g.filePath && void openSignedDoc(g.filePath)}>
    ⬇ {g.label}{(g.missing?.length ?? 0) > 0 ? " ⚠" : ""}
  </button>
  {signedSent.has(g.documentType) ? (
    <span className="cli-doc-hint">✓ assinado recebido</span>
  ) : (
    <label className="cli-doc-signed">
      <span>Anexar assinado</span>
      <input type="file" accept="image/*,.pdf" disabled={signedBusy === g.documentType}
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleSigned(g.documentType, g.label, f); }} />
    </label>
  )}
</div>
```

- [ ] **Step 4: CSS mínimo** (em `src/styles/clientes.css`)

```css
.cli-doc-gen-item { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; }
.cli-doc-signed { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--cli-ink); }
```

- [ ] **Step 5: Commit**

```
git add src/components/clients/ClienteFormWizard.tsx src/styles/clientes.css
git commit -m "feat(cadastro): upload do documento assinado abaixo de cada gerado"
```

---

### Task 4: Ponto 2 — "não possui" em tel. comercial/residencial + revisão

**Files:**
- Modify: `src/components/clients/ClienteFormWizard.tsx` (`renderContato` ~434-456; `renderReview` ~540-607; `handleConfirm` payload ~223-227)

**Interfaces:**
- Grava a string `"não possui"` em `phone_commercial`/`phone_home` quando marcado.

- [ ] **Step 1: Estado dos toggles**

Perto de `pixMode`:

```tsx
const NAO_POSSUI = "não possui";
const [phoneCommNone, setPhoneCommNone] = useState(initialValues?.phone_commercial === NAO_POSSUI);
const [phoneHomeNone, setPhoneHomeNone] = useState(initialValues?.phone_home === NAO_POSSUI);
```

- [ ] **Step 2: UI em `renderContato`** (comercial e residencial)

Para cada um, ao lado do label, um checkbox "não possui"; ao marcar, limpa e desabilita o input:

```tsx
<label className="cli-wa-check">
  <input type="checkbox" checked={phoneCommNone}
    onChange={e => { setPhoneCommNone(e.target.checked); patch({ phone_commercial: e.target.checked ? NAO_POSSUI : "" }); }} />
  não possui
</label>
// no input: value={phoneCommNone ? "" : form.phone_commercial} disabled={phoneCommNone}
```

(idem `phoneHomeNone` / `phone_home`.)

- [ ] **Step 3: Payload** — em `handleConfirm`, garantir que `"não possui"` seja preservado (o loop `payload[k] = form[k] === "" ? null : form[k]` já preserva a string; nenhuma mudança extra, mas confirmar que o toggle setou o valor).

- [ ] **Step 4: Revisão** — em `renderReview`, os telefones opcionais: quando valor `"não possui"` → mostra "não possui"; quando vazio → mostra "—" (não `[A PREENCHER]`). Marcar essas linhas como não-sensíveis e não-obrigatórias:

```tsx
add("Tel. Comercial", form.phone_commercial ? (form.phone_commercial === NAO_POSSUI ? "não possui" : form.phone_commercial + (form.phone_commercial_is_whatsapp ? " (WhatsApp)" : "")) : "—");
add("Tel. Residencial", form.phone_home ? (form.phone_home === NAO_POSSUI ? "não possui" : form.phone_home + (form.phone_home_is_whatsapp ? " (WhatsApp)" : "")) : "—");
```

E no render das linhas, tratar `"—"` como vazio-opcional (exibe "—", classe normal, sem `[A PREENCHER]`).

- [ ] **Step 5: Commit**

```
git add src/components/clients/ClienteFormWizard.tsx
git commit -m "feat(cadastro): nao possui em tel comercial/residencial (sem [A PREENCHER])"
```

---

### Task 5: Ponto 3 — "Cadastro concluído"

**Files:**
- Modify: `src/components/clients/ClienteFormWizard.tsx` (`ClientDocumentsPhase`, título ~674)

- [ ] **Step 1: Título explícito**

Trocar o `<div className="cli-formsec">Cliente cadastrado{...}</div>` por:

```tsx
<div className="cli-formsec">✓ Cadastro concluído</div>
{clientName && <div className="cli-doc-hint" style={{ marginTop: -6 }}>Cliente: {clientName}</div>}
```

(O form de 5 etapas já não é renderizado após `savedId` — a troca para `ClientDocumentsPhase` já "fecha" o wizard.)

- [ ] **Step 2: Commit**

```
git add src/components/clients/ClienteFormWizard.tsx
git commit -m "feat(cadastro): mensagem 'Cadastro concluido' na fase de documentos"
```

---

### Task 6: Ponto 1 — card cabe no viewport do chat + scrollIntoView

**Files:**
- Modify: `src/styles/clientes.css` (`.cli-wizard-chat`, `.cli-wizard`, `.cli-formgrid`)
- Modify: `src/components/clients/ClienteFormWizard.tsx` (ref + scrollIntoView no `variant==="chat"`)

- [ ] **Step 1: CSS — constranger ao viewport (só no chat)**

```css
.cli-wizard-chat { margin: 8px 0; }
.cli-wizard-chat .cli-form-card {
  display: flex; flex-direction: column;
  max-height: min(72vh, 640px);
}
.cli-wizard-chat .cli-steps { flex: 0 0 auto; }
.cli-wizard-chat .cli-formgrid { flex: 1 1 auto; overflow-y: auto; min-height: 0; padding-right: 4px; }
.cli-wizard-chat .cli-form-actions { flex: 0 0 auto; }
```

- [ ] **Step 2: ref + scrollIntoView**

No componente, criar `const cardRef = useRef<HTMLDivElement>(null);`, aplicar `ref={cardRef}` no `.cli-form-card`, e:

```tsx
useEffect(() => {
  if (variant === "chat") cardRef.current?.scrollIntoView({ block: "nearest" });
}, [variant, step, reviewing, savedId]);
```

- [ ] **Step 3: Commit**

```
git add src/styles/clientes.css src/components/clients/ClienteFormWizard.tsx
git commit -m "feat(cadastro): card do wizard cabe no viewport do chat + scrollIntoView"
```

---

### Task 7: Verificação do Bloco A no CI (PR)

- [ ] **Step 1: Push do branch e abrir PR**

```
git push -u origin claude/cadastro-refino-bloco-a
gh pr create --base main --title "feat(cadastro): refino do wizard/painel (pontos 1-6)" --body-file <corpo>
```

- [ ] **Step 2: Aguardar CI verde** (`gh pr checks <n> --watch`) — `ci` roda vitest + build. Corrigir o que falhar.
- [ ] **Step 3: Merge após verde** (`gh pr merge <n> --merge --delete-branch`).

---

### Task 8: Resolvedor de cliente (edge, lógica pura + testes)

**Files:**
- Create: `supabase/functions/chat-orchestrator/clientResolver.ts`
- Test: `supabase/functions/chat-orchestrator/clientResolver.test.ts`

**Interfaces:**
- Produces:
  - `extractClientQuery(message: string): string | null`
  - `type ClientHit = { id: string; full_name: string; cpf_masked?: string; city?: string }`
  - `type ClientResolution = { status: "none" } | { status: "resolved"; client: ClientHit } | { status: "ambiguous"; candidates: ClientHit[] }`
  - `resolveClient(search: (q: string) => Promise<ClientHit[]>, query: string): Promise<ClientResolution>`

- [ ] **Step 1: Testes (Deno)** — `clientResolver.test.ts`

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractClientQuery, resolveClient, type ClientHit } from "./clientResolver.ts";

Deno.test("extractClientQuery pega o nome após 'do cliente'", () => {
  assertEquals(extractClientQuery("quero anexar documentos do cliente João Silva"), "João Silva");
  assertEquals(extractClientQuery("modificar o cadastro do cliente Maria Souza"), "Maria Souza");
});
Deno.test("extractClientQuery pega CPF numérico", () => {
  assertEquals(extractClientQuery("abrir cadastro do 084.822.105-21"), "084.822.105-21");
});
Deno.test("extractClientQuery devolve null sem alvo", () => {
  assertEquals(extractClientQuery("bom dia"), null);
});
Deno.test("resolveClient: 0/1/N", async () => {
  const none = await resolveClient(async () => [], "x");
  assertEquals(none.status, "none");
  const one: ClientHit[] = [{ id: "c1", full_name: "MARIA" }];
  const r1 = await resolveClient(async () => one, "maria");
  assertEquals(r1.status, "resolved");
  const many: ClientHit[] = [{ id: "c1", full_name: "MARIA A" }, { id: "c2", full_name: "MARIA B" }];
  const rN = await resolveClient(async () => many, "maria");
  assertEquals(rN.status, "ambiguous");
});
```

- [ ] **Step 2: Implementação** — `clientResolver.ts`

```ts
export type ClientHit = { id: string; full_name: string; cpf_masked?: string; city?: string };
export type ClientResolution =
  | { status: "none" }
  | { status: "resolved"; client: ClientHit }
  | { status: "ambiguous"; candidates: ClientHit[] };

const CPF_RE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
// Frases: "...do cliente X", "cadastro de X", "cliente X". Conservador.
const NOME_RE = /(?:d[oa]s?\s+)?cliente\s+(.+?)(?:[.,;]|$)/i;
const CAD_DE_RE = /cadastro\s+d[oe]\s+(.+?)(?:[.,;]|$)/i;

export function extractClientQuery(message: string): string | null {
  if (!message) return null;
  const cpf = message.match(CPF_RE);
  if (cpf) return cpf[0];
  const m1 = message.match(NOME_RE);
  if (m1?.[1]?.trim()) return m1[1].trim();
  const m2 = message.match(CAD_DE_RE);
  if (m2?.[1]?.trim()) return m2[1].trim();
  return null;
}

export async function resolveClient(
  search: (q: string) => Promise<ClientHit[]>, query: string,
): Promise<ClientResolution> {
  const hits = (await search(query)) ?? [];
  if (hits.length === 0) return { status: "none" };
  if (hits.length === 1) return { status: "resolved", client: hits[0] };
  return { status: "ambiguous", candidates: hits };
}
```

- [ ] **Step 3: Commit**

```
git add supabase/functions/chat-orchestrator/clientResolver.ts supabase/functions/chat-orchestrator/clientResolver.test.ts
git commit -m "feat(chat): Resolvedor de cliente (extract + resolve 0/1/N) com testes"
```

- [ ] **Step 4: PR + CI** — push, PR, aguardar `edge` verde (Deno test roda no job edge), merge. (Deploy do edge não é necessário: o Resolvedor ainda não tem consumidor — base do ponto 7.)

---

## Self-Review

**Spec coverage:** 1→Task 6; 2→Task 4; 3→Task 5; 4→Tasks 1+2; 5→Task 2; 6→Tasks 1+3; Resolvedor→Task 8. ✔ (ponto 7 flows fora de escopo, conforme spec.)
**Placeholders:** nenhum "TBD"/"handle edge cases" — código concreto em cada step.
**Type consistency:** `buildDocInsert`/`uploadSignedDocument` (Task 1) usados em Tasks 2/3; `DOC_TYPE_BY_SLOT` inalterado; `ClientResolution`/`ClientHit` (Task 8) coerentes entre teste e impl.

## Notas de execução
- Bloco A (Tasks 1–6) é um PR único coeso (mesmos arquivos) → verificar no CI (Task 7).
- Resolvedor (Task 8) é PR separado (edge), independente.
- Sem `vitest`/`deno` local → a verificação "roda o teste" de cada task acontece no CI do PR.
