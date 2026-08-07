import { useState } from "react";
import { toast } from "sonner";
import { formatDateBR } from "@/components/clients/shared";
import { DILIGENCIA_TIPO_OPTIONS } from "@/lib/p2";
import { rpcDiligencia } from "./diligenciasApi";
import { avisosRegistrar, falhaRegistrar } from "./diligenciasLogic";

/* ============================================================
   Card 11 — “Nova diligência” (registrar_diligencia)
   ============================================================
   O formulário manda `p_processo_numero` e NUNCA `p_process_id`: o id do
   processo não é dado que ninguém digita. Quem resolve é `_resolver_processo`,
   que vincula quando o número casa com EXATAMENTE UM processo (ILIKE
   '%numero%'); casando com nenhum ou com vários, a diligência é guardada só
   pelo número (“ponte”) e a RPC devolve aviso — que a tela exibe.

   O seletor de tipo é fechado: `registrar_diligencia` recusa tipo desconhecido
   com `tipo_invalido`, e os códigos vivem em src/lib/p2.ts (espelho do CHECK).
============================================================ */

const VAZIO = {
  descricao: "", tipo: DILIGENCIA_TIPO_OPTIONS[0].value, processo_numero: "",
  vara: "", prazo: "", responsavel_nome: "", observacao: "",
};

export default function NovaDiligenciaCard({ varas, aberto, onToggle, onCriada }: {
  varas: string[];
  aberto: boolean;
  onToggle: () => void;
  onCriada: (titulo: string, avisos: string[]) => void;
}) {
  const [f, setF] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof VAZIO) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  async function salvar() {
    setSalvando(true);
    const { data, error } = await rpcDiligencia("registrar_diligencia", {
      p_descricao: f.descricao.trim(),
      p_tipo: f.tipo,
      // A tela não tem de onde tirar um uuid de processo; a RPC resolve pelo número.
      p_process_id: null,
      p_processo_numero: f.processo_numero.trim() || null,
      p_vara: f.vara.trim() || null,
      // Data vazia vai como null (string vazia em coluna date = 22007).
      p_prazo: f.prazo || null,
      p_responsavel_nome: f.responsavel_nome.trim() || null,
      p_observacao: f.observacao.trim() || null,
    });
    const err = falhaRegistrar(data, error);
    setSalvando(false);
    if (err) { toast.error(err); return; }
    // O prazo vai junto porque a RPC aceita data no passado em silêncio (pendência
    // nasce vencida) — quem avisa é a tela.
    const avisos = avisosRegistrar(data, f.prazo || null);
    toast.success(data?.processo_vinculado
      ? "Diligência registrada e vinculada ao processo."
      : "Diligência registrada pelo número do processo.");
    setF({ ...VAZIO });
    onCriada(`Diligência registrada no processo ${data?.processo ?? f.processo_numero.trim()}.`, avisos);
  }

  if (!aberto) {
    return (
      <div className="cli-card lift" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="cli-sec-title" style={{ margin: 0 }}>Nova diligência</div>
          <div style={{ fontSize: 12.5, color: "var(--cli-muted)", fontWeight: 600 }}>
            Com prazo, abre pendência em Tarefas. Sem prazo, só entra nesta lista.
          </div>
        </div>
        <button className="cli-btn" onClick={onToggle}>+ Nova diligência</button>
      </div>
    );
  }

  const podeSalvar = f.descricao.trim() !== "" && f.processo_numero.trim() !== "";

  return (
    <div className="cli-card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <div className="cli-sec-title" style={{ margin: 0, flex: 1 }}>Nova diligência</div>
        <button className="cli-btn sm ghost" onClick={onToggle}>Fechar</button>
      </div>

      <div className="cli-formgrid">
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="cli-label" htmlFor="nd-desc">O que precisa ser feito</label>
          <textarea id="nd-desc" className="cli-textarea" value={f.descricao} onChange={set("descricao")}
            placeholder="ex.: pedir vista dos autos no balcão virtual e juntar comprovante" />
        </div>

        <div>
          <label className="cli-label" htmlFor="nd-proc">Número do processo</label>
          <input id="nd-proc" className="cli-input" value={f.processo_numero} onChange={set("processo_numero")}
            placeholder="obrigatório" />
        </div>

        <div>
          <label className="cli-label" htmlFor="nd-tipo">Tipo</label>
          <select id="nd-tipo" className="cli-select" value={f.tipo} onChange={set("tipo")}>
            {DILIGENCIA_TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="cli-label" htmlFor="nd-vara">Vara</label>
          <input id="nd-vara" className="cli-input" list="nd-varas" value={f.vara} onChange={set("vara")}
            placeholder="agrupa a lista" />
          <datalist id="nd-varas">{varas.map(v => <option key={v} value={v} />)}</datalist>
        </div>

        <div>
          <label className="cli-label" htmlFor="nd-prazo">Prazo</label>
          <input id="nd-prazo" className="cli-input" type="date" value={f.prazo} onChange={set("prazo")} />
        </div>

        <div>
          <label className="cli-label" htmlFor="nd-resp">Responsável</label>
          <input id="nd-resp" className="cli-input" value={f.responsavel_nome} onChange={set("responsavel_nome")}
            placeholder="texto livre" />
        </div>

        <div>
          <label className="cli-label" htmlFor="nd-obs">Observação</label>
          <input id="nd-obs" className="cli-input" value={f.observacao} onChange={set("observacao")}
            placeholder="opcional" />
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 12, display: "grid", gap: 4 }}>
        <span>
          {f.prazo
            ? `Com prazo ${formatDateBR(f.prazo)}, o banco abre uma pendência em Tarefas.`
            : "SEM prazo nenhuma pendência é criada — a diligência só aparece nesta tela."}
        </span>
        <span>
          O número é vinculado ao processo cadastrado quando casa com exatamente UM.
          Casando com nenhum ou com vários, fica guardada pelo número, com o chip “não vinculado”.
        </span>
      </div>

      <div className="cli-form-actions">
        <button className="cli-btn" disabled={salvando || !podeSalvar} onClick={() => void salvar()}>
          {salvando ? "Registrando…" : "Registrar diligência"}
        </button>
        <button className="cli-btn ghost" disabled={salvando} onClick={onToggle}>Cancelar</button>
        {!podeSalvar && (
          <span style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 700, alignSelf: "center" }}>
            descrição e número do processo são obrigatórios (o banco recusa sem eles)
          </span>
        )}
      </div>
    </div>
  );
}
