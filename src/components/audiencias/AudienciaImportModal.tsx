import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  detectarColunas, montarLoteAudiencias, OFFSETS_LEMBRETE_DEFAULT,
  type ItemAudiencia, type LinhaDescartada,
} from "@/lib/audienciaPlanilha";
import {
  agruparDescartes, colunaLetra, colunasDuplicadas, COLUNAS_ESPERADAS,
  detectarLinhaCabecalho, ensaioLiberaConfirmacao, faltamColunasObrigatorias,
  linhaAbsoluta, parsearOffsets, resumoImportacao, traduzirErroRpc,
  type ImportacaoRet,
} from "@/lib/audienciaCard13";
import { importarAudienciasPlanilha } from "@/hooks/useAudienciaCard13";
import { formatAudienciaDateTime } from "@/lib/audiencias";
import { CARD13_ROOT, Card13Style } from "@/components/audiencias/card13Styles";
import { overlay, modal, btnPrimary, btnGhost, COLORS, FONT } from "@/components/kanban/kanbanStyles";
// Leitor .xlsx do projeto (JSZip), o MESMO usado pelos importadores em lote.
// Aceita File/Blob no navegador; a tipagem vem do .d.mts ao lado — não existe
// segunda cópia do leitor.
import { readWorkbook } from "../../../scripts/lib/xlsxLite.mjs";

/* ============================================================
   Card 13 · 3.1 — Importação em massa da planilha de audiências
   ============================================================
   Fluxo, na ordem, sem atalho:

     arquivo → escolher UMA aba → conferir mapa de colunas + amostra + descartes
             → ENSAIO (p_dry_run = true) → confirmar (p_dry_run = false)

   Por que uma aba por vez: a planilha tem 22 abas (jan/2025 → jan/2027) com ~500
   audiências por mês (junho/2025 tem 656). Importar tudo de uma vez tornaria
   impossível conferir o ensaio.

   PERIGO MEDIDO no corpo da RPC: o ensaio é `IF p_dry_run THEN … CONTINUE`, e
   NULL em condição plpgsql é FALSO — `p_dry_run: null` GRAVA o lote inteiro sem
   ensaio. Por isso o argumento é sempre booleano explícito (ver
   importarAudienciasPlanilha, que recusa não-booleano).
============================================================ */

type IconProps = { size?: number };
function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
const IcX = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;

const AMOSTRA = 10;

interface Props {
  onClose: () => void;
  /** Chamado depois de uma importação REAL (a tela recarrega a agenda). */
  onImportado: () => void;
}

export function AudienciaImportModal({ onClose, onImportado }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [abas, setAbas] = useState<string[]>([]);
  const [abaSel, setAbaSel] = useState("");
  const [linhas, setLinhas] = useState<string[][]>([]);
  const [linhaCab, setLinhaCab] = useState(0);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [offsetsTxt, setOffsetsTxt] = useState(OFFSETS_LEMBRETE_DEFAULT.join(", "));
  const [ensaio, setEnsaio] = useState<ImportacaoRet | null>(null);
  const [final, setFinal] = useState<ImportacaoRet | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const cabecalho = linhas[linhaCab] ?? [];
  const { offsets, erro: erroOffsets } = useMemo(() => parsearOffsets(offsetsTxt), [offsetsTxt]);

  // Origem grava de onde a audiência veio (a coluna `origem` é texto livre —
  // conferido: `audiencias` não tem CHECK nessa coluna).
  const origem = abaSel ? `Planilha de audiências / ${abaSel}` : "Planilha de audiências";

  const { itens, descartadas } = useMemo<{ itens: ItemAudiencia[]; descartadas: LinhaDescartada[] }>(() => {
    if (linhas.length === 0) return { itens: [], descartadas: [] };
    return montarLoteAudiencias(linhas.slice(linhaCab + 1), mapa, origem);
  }, [linhas, linhaCab, mapa, origem]);

  const faltam = faltamColunasObrigatorias(mapa);
  const duplicadas = colunasDuplicadas(mapa);
  const grupos = useMemo(
    () => agruparDescartes(descartadas.map((d) => ({ ...d, linha: linhaAbsoluta(d.linha, linhaCab) }))),
    [descartadas, linhaCab],
  );

  // Qualquer mexida no lote/offsets invalida o ensaio anterior.
  const zerarEnsaio = () => { setEnsaio(null); setFinal(null); };

  const escolherArquivo = async (f: File | null) => {
    zerarEnsaio();
    setErro(null);
    setArquivo(f); setAbas([]); setAbaSel(""); setLinhas([]); setMapa({}); setLinhaCab(0);
    if (!f) return;
    setOcupado("Lendo a planilha…");
    try {
      // Passada 1: só os NOMES das abas (onlySheets: [] não parseia nenhuma) —
      // parsear 22 abas para depois usar uma seria desperdício e trava a tela.
      const sheets = await readWorkbook(f, { onlySheets: [] });
      const nomes = sheets.map((s) => s.name);
      setAbas(nomes);
      if (nomes.length === 0) {
        setErro("Planilha NÃO lida: nenhuma aba encontrada no arquivo (o .xlsx pode estar corrompido).");
        return;
      }
      if (nomes.length === 1) await escolherAba(nomes[0], f);
    } catch (e) {
      setErro(`Planilha NÃO lida: ${(e as Error).message}`);
    } finally {
      setOcupado(null);
    }
  };

  const escolherAba = async (nome: string, f?: File) => {
    const alvo = f ?? arquivo;
    zerarEnsaio();
    setAbaSel(nome); setLinhas([]); setMapa({}); setLinhaCab(0);
    if (!alvo || !nome) return;
    setOcupado(`Lendo a aba "${nome}"…`);
    try {
      // Passada 2: só a aba escolhida. `onlySheets` casa por PREFIXO normalizado,
      // então pode trazer mais de uma ("Janeiro" casaria "Janeiro 2026") — pegamos
      // a de nome exato.
      const sheets = await readWorkbook(alvo, { onlySheets: [nome], maxCol: 40 });
      const sheet = sheets.find((s) => s.name === nome);
      const rows = sheet?.rows ?? [];
      setLinhas(rows);
      if (rows.length === 0) {
        setErro(`Aba "${nome}" NÃO tem linhas legíveis (aba vazia ou só com fórmulas — o leitor não avalia fórmula).`);
        return;
      }
      const idx = detectarLinhaCabecalho(rows);
      const cab = idx >= 0 ? idx : 0;
      setLinhaCab(cab);
      setMapa(detectarColunas(rows[cab] ?? []));
      if (idx < 0) {
        setErro("Não achei o cabeçalho nas primeiras linhas desta aba. Ajuste a linha do cabeçalho e o mapa de colunas à mão antes do ensaio.");
      } else {
        setErro(null);
      }
    } catch (e) {
      setErro(`Aba NÃO lida: ${(e as Error).message}`);
    } finally {
      setOcupado(null);
    }
  };

  const trocarLinhaCab = (n: number) => {
    zerarEnsaio();
    const i = Math.max(0, Math.min(n, Math.max(0, linhas.length - 1)));
    setLinhaCab(i);
    setMapa(detectarColunas(linhas[i] ?? []));
  };

  const trocarColuna = (chave: string, valor: string) => {
    zerarEnsaio();
    setMapa((m) => {
      const novo = { ...m };
      if (valor === "") delete novo[chave];
      else novo[chave] = Number(valor);
      return novo;
    });
  };

  const rodar = async (dryRun: boolean) => {
    setErro(null);
    setOcupado(dryRun ? "Ensaiando no servidor…" : "Importando…");
    const { data, error } = await importarAudienciasPlanilha({
      lote: itens, offsets, dryRun, // booleano explícito, SEMPRE
    });
    setOcupado(null);
    if (error) {
      setErro(traduzirErroRpc(error, dryRun ? "Ensaio NÃO realizado" : "Importação NÃO realizada"));
      return;
    }
    if (!data || data.ok !== true) {
      setErro(`${dryRun ? "Ensaio" : "Importação"} NÃO realizado: ${data?.motivo ?? "o servidor não explicou o motivo"}.`);
      return;
    }
    if (dryRun) { setEnsaio(data); setFinal(null); } else { setFinal(data); }
  };

  const { libera, bloqueio } = ensaioLiberaConfirmacao(ensaio, offsets);
  const podeEnsaiar = itens.length > 0 && faltam.length === 0 && duplicadas.length === 0 && !erroOffsets && !ocupado;
  const resultado = final ?? ensaio;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Importar planilha de audiências"
      style={{ ...overlay, position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ ...modal, color: COLORS.text1, maxWidth: 860, width: "min(860px, 96vw)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, color: COLORS.text1, fontFamily: FONT }}>
            Importar planilha de audiências
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar"
            style={{ background: "transparent", border: "none", color: COLORS.text2, cursor: "pointer" }}>
            <IcX size={18} />
          </button>
        </div>

        <div className={CARD13_ROOT}>
          <Card13Style />
          <div className="card13-stack">
            {/* 1 — arquivo */}
            <div>
              <label className="cli-label" htmlFor="imp-file">1. Arquivo .xlsx</label>
              <input id="imp-file" type="file" accept=".xlsx" className="cli-input file"
                onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)} />
              <div className="card13-sub" style={{ marginTop: 4 }}>
                O arquivo é lido no seu navegador; nada sai daqui antes do ensaio.
              </div>
            </div>

            {/* 2 — aba */}
            {abas.length > 0 && (
              <div>
                <label className="cli-label" htmlFor="imp-aba">
                  2. Aba (uma por vez — {abas.length} encontradas)
                </label>
                <select id="imp-aba" className="cli-select" value={abaSel}
                  onChange={(e) => void escolherAba(e.target.value)}>
                  <option value="">— escolher a aba —</option>
                  {abas.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <div className="card13-sub" style={{ marginTop: 4 }}>
                  Cada aba é um mês (~500 audiências). Importe e confira uma antes de passar à seguinte.
                </div>
              </div>
            )}

            {ocupado && <div className="card13-info" role="status">{ocupado}</div>}
            {erro && <div className="card13-warn" role="alert">{erro}</div>}

            {/* 3 — conferência humana */}
            {linhas.length > 0 && (
              <>
                <div>
                  <div className="cli-sec-title">3. Confira antes de qualquer chamada</div>
                  <div className="card13-sub">
                    A aba tem {linhas.length} linha(s). Cabeçalho detectado na linha{" "}
                    {linhaCab + 1}; {itens.length} audiência(s) montada(s) e {descartadas.length} descartada(s).
                  </div>
                </div>

                <div className="card13-grid">
                  <div>
                    <label className="cli-label" htmlFor="imp-cab">Linha do cabeçalho</label>
                    <input id="imp-cab" className="cli-input" type="number" min={1} max={linhas.length}
                      value={linhaCab + 1}
                      onChange={(e) => trocarLinhaCab(Number(e.target.value) - 1)} />
                  </div>
                  {COLUNAS_ESPERADAS.map((c) => (
                    <div key={c.chave}>
                      <label className="cli-label" htmlFor={`imp-col-${c.chave}`}>
                        {c.label}{c.obrigatoria ? " *" : ""}
                      </label>
                      <select id={`imp-col-${c.chave}`} className="cli-select"
                        value={mapa[c.chave] === undefined ? "" : String(mapa[c.chave])}
                        onChange={(e) => trocarColuna(c.chave, e.target.value)}>
                        <option value="">— não usar —</option>
                        {cabecalho.map((titulo, i) => (
                          <option key={i} value={i}>
                            {colunaLetra(i)} · {String(titulo ?? "").trim() || "(sem título)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {faltam.length > 0 && (
                  <div className="card13-warn">
                    Sem estas colunas não há audiência: {faltam.join(", ")}. Ajuste o mapa (ou a linha do cabeçalho).
                  </div>
                )}
                {duplicadas.length > 0 && (
                  <div className="card13-warn">
                    Duas colunas apontam para a mesma célula ({duplicadas.join("; ")}). Corrija antes do ensaio.
                  </div>
                )}

                {/* amostra */}
                <div>
                  <div className="cli-sec-title">Amostra ({Math.min(AMOSTRA, itens.length)} de {itens.length})</div>
                  <div className="card13-scroll">
                    <table className="card13-tbl">
                      <thead>
                        <tr>
                          <th>Cliente</th><th>Parte contrária</th><th>Data e hora</th>
                          <th>Tipo de ação</th><th>Processo</th><th>Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.slice(0, AMOSTRA).map((it, i) => (
                          <tr key={i}>
                            <td>{it.cliente}</td>
                            <td>{it.parte_contraria ?? "—"}</td>
                            <td>{formatAudienciaDateTime(it.data_hora)}</td>
                            <td>{it.tipo_acao ?? "—"}</td>
                            <td>{it.processo_numero ?? "—"}</td>
                            <td>{it.observacao ?? "—"}</td>
                          </tr>
                        ))}
                        {itens.length === 0 && (
                          <tr><td colSpan={6}>Nenhuma linha virou audiência com este mapa de colunas.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* descartes com motivo */}
                {grupos.length > 0 && (
                  <div>
                    <div className="cli-sec-title">Linhas descartadas ({descartadas.length})</div>
                    <div className="card13-sub" style={{ marginBottom: 6 }}>
                      Não entram no lote (linha sem cliente ou com data que o parser não reconheceu).
                      Importar audiência com data adivinhada é pior que não importar.
                    </div>
                    <div className="card13-scroll">
                      <table className="card13-tbl">
                        <thead><tr><th>Motivo</th><th>Qtd.</th><th>Linhas da planilha</th></tr></thead>
                        <tbody>
                          {grupos.map((g) => (
                            <tr key={g.motivo}>
                              <td>{g.motivo}</td>
                              <td className="card13-num">{g.quantidade}</td>
                              <td>{g.linhas.slice(0, 25).join(", ")}{g.linhas.length > 25 ? ` … (+${g.linhas.length - 25})` : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* offsets */}
                <div>
                  <label className="cli-label" htmlFor="imp-off">
                    Offsets dos lembretes (dias ANTES da audiência)
                  </label>
                  <input id="imp-off" className="cli-input" value={offsetsTxt}
                    onChange={(e) => { zerarEnsaio(); setOffsetsTxt(e.target.value); }} />
                  <div className="card13-sub" style={{ marginTop: 4 }}>
                    Default {OFFSETS_LEMBRETE_DEFAULT.join(", ")} (0 = no dia da audiência). Só gera
                    lembrete para data a partir de hoje. Mexer aqui invalida o ensaio.
                  </div>
                  {erroOffsets && <div className="card13-warn" style={{ marginTop: 6 }}>{erroOffsets}</div>}
                </div>

                {/* 4 — ensaio, depois confirmação */}
                <div className="card13-acts">
                  <button type="button" style={{ ...btnPrimary, opacity: podeEnsaiar ? 1 : 0.5, cursor: podeEnsaiar ? "pointer" : "not-allowed" }}
                    disabled={!podeEnsaiar} onClick={() => void rodar(true)}>
                    Ensaiar importação (dry-run)
                  </button>
                  {ensaio && !final && (
                    <button type="button"
                      style={{ ...btnPrimary, opacity: libera && !ocupado ? 1 : 0.5, cursor: libera && !ocupado ? "pointer" : "not-allowed" }}
                      disabled={!libera || !!ocupado} title={bloqueio ?? undefined}
                      onClick={() => void rodar(false)}>
                      Confirmar importação ({ensaio.audiencias_criadas ?? 0})
                    </button>
                  )}
                  <button type="button" style={btnGhost} onClick={onClose}>Fechar</button>
                </div>
                {!ensaio && (
                  <div className="card13-info">
                    O ensaio é obrigatório: ele roda a importação inteira no servidor sem gravar nada
                    e mostra exatamente o que aconteceria.
                  </div>
                )}
                {ensaio && !final && bloqueio && <div className="card13-warn">{bloqueio}</div>}
              </>
            )}

            {/* resultado (ensaio ou importação real) */}
            {resultado && (
              <div>
                <div className="cli-sec-title">
                  {final ? "Importação concluída" : "Resultado do ensaio (nada foi gravado)"}
                </div>
                <div className="card13-grid" style={{ marginTop: 8 }}>
                  {resumoImportacao(resultado).map((l) => (
                    <div className="card13-kv" key={l.chave}>
                      <div className="k">{l.label}</div>
                      <div className="v" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className={`cli-chip ${l.cls} card13-num`}>{l.valor}</span>
                      </div>
                      <div className="card13-sub">{l.explica}</div>
                    </div>
                  ))}
                </div>

                <div className="card13-sub" style={{ marginTop: 6 }}>
                  Offsets usados pelo servidor: {(resultado.offsets_usados ?? []).join(", ") || "—"}
                </div>

                {/* A nota da RPC vai para a tela como veio: as importadas NÃO aparecem
                    no Google Calendar até edição manual. */}
                {resultado.nota && (
                  <div className="card13-note" style={{ marginTop: 10 }}>
                    Google Calendar: {resultado.nota}
                  </div>
                )}

                {(resultado.erros?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="cli-sec-title">Linhas recusadas pelo banco</div>
                    <div className="card13-scroll">
                      <table className="card13-tbl">
                        <thead><tr><th>Cliente</th><th>Erro do servidor</th></tr></thead>
                        <tbody>
                          {(resultado.erros ?? []).map((e, i) => (
                            <tr key={i}><td>{e.cliente ?? "—"}</td><td>{e.erro ?? "—"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {final && (
                  <div className="card13-acts" style={{ marginTop: 12 }}>
                    <button type="button" style={btnPrimary} onClick={() => { onImportado(); onClose(); }}>
                      Ver na agenda
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
