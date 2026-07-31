/* ============================================================
   Card 13 — casca visual compartilhada dos três painéis
   ============================================================
   Reaproveita as classes `.cli-*` de src/styles/clientes.css (cli-card, cli-row,
   cli-chip, cli-btn, cli-table, cli-input…). Elas são globais, MAS as cores vêm
   de variáveis declaradas em `.cli-root` — por isso todo painel precisa desse
   ancestral. Como `.cli-root` também é o layout de PÁGINA (min-height:100vh,
   padding, fundo), a classe `.card13-embed` neutraliza só essas três coisas,
   preservando as variáveis. Sem isso um painel dentro de modal ganharia 100vh de
   fundo escuro.
============================================================ */

/** Classe do container de qualquer painel do Card 13. */
export const CARD13_ROOT = "cli-root card13-embed";

const CSS = `
.cli-root.card13-embed{min-height:0;padding:0;background:transparent;font-size:14px}
.card13-embed .card13-sub{font-size:12.5px;color:var(--cli-muted-light);font-weight:600;line-height:1.5}
.card13-embed .card13-note,.card13-embed .card13-warn,.card13-embed .card13-info{
  border-radius:12px;padding:10px 13px;font-size:12.5px;font-weight:600;line-height:1.5;border:2px solid var(--cli-ink)}
.card13-embed .card13-note{background:#F6D24B;color:#3A2A05}
.card13-embed .card13-warn{background:var(--cli-red);color:var(--cli-red-deep)}
.card13-embed .card13-info{background:var(--cli-panel);color:var(--cli-muted-light);border-color:#ffffff26}
.card13-embed .card13-stack{display:grid;gap:12px}
.card13-embed .card13-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.card13-embed .card13-kv{background:var(--cli-panel);border:2px solid #ffffff1f;border-radius:11px;padding:9px 12px;min-width:0}
.card13-embed .card13-kv .k{font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:var(--cli-muted)}
.card13-embed .card13-kv .v{font-size:14px;font-weight:700;color:var(--cli-cream);margin-top:2px;overflow-wrap:anywhere}
.card13-embed .card13-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.card13-embed .card13-scroll{overflow-x:auto;max-height:270px;overflow-y:auto;
  border:2px solid #ffffff1f;border-radius:11px;background:var(--cli-panel)}
.card13-embed table.card13-tbl{width:100%;border-collapse:collapse;font-size:12px}
.card13-embed table.card13-tbl th{position:sticky;top:0;background:#26241a;color:var(--cli-muted-light);
  font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;text-align:left;padding:7px 9px;white-space:nowrap}
.card13-embed table.card13-tbl td{padding:6px 9px;border-top:1px solid #ffffff14;color:var(--cli-cream);
  font-weight:600;vertical-align:top;max-width:260px;overflow-wrap:anywhere}
.card13-embed .card13-num{font-variant-numeric:tabular-nums;font-weight:800}
.card13-embed .card13-lembrete{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;
  background:var(--cli-panel);border:2px solid #ffffff1f;border-radius:11px;padding:10px 12px}
.card13-embed .card13-lembrete .lb-body{flex:1;min-width:170px}
.card13-embed .card13-doclist{display:flex;gap:6px;flex-wrap:wrap}
.card13-embed .cli-input,.card13-embed .cli-select{font-size:13px}
@media(prefers-reduced-motion:reduce){.card13-embed *{transition:none!important}}
`;

/** `<style>` dos painéis. Idempotente: repetir a tag em painéis aninhados é inócuo. */
export function Card13Style() {
  return <style>{CSS}</style>;
}
