// V11: tema único — GlobalStyles não precisa mais receber prop.
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;0,7..72,700;1,7..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=League+Spartan:wght@400;600;700;800&family=Roboto:wght@700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --font-disp: 'Literata', Georgia, 'Times New Roman', serif;
      --font-body: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      --font-mono: 'Plus Jakarta Sans', system-ui, sans-serif;
      --font-brand: 'Roboto', system-ui, -apple-system, sans-serif;
      --font-spartan: 'League Spartan', 'Plus Jakarta Sans', system-ui, sans-serif;
      --gold: #EAB308; --gold2: #FACC15;
      --theme-transition: 0.42s cubic-bezier(0.22, 1, 0.36, 1);
      --panel-ease: cubic-bezier(0.22, 1, 0.36, 1);
    }
    :root {
      --bg: #09090f; --bg2: #11111a; --bg3: #16161f; --bg4: #1c1c28;
      --border: #25253a; --border2: #34344d;
      --card-border: #25253a;
      --card-border-hover: #3a3a55;
      --text1: #eeeef5; --text2: #c4c4d4; --text3: #7a7a92;
      --logo-text: #0a0a12;
      --user-bubble-bg: rgba(234,179,8,0.08); --user-bubble-border: rgba(234,179,8,0.22);
      --badge-bg: rgba(255,255,255,0.06);
    }
    body, .jc-root, .jc-sidebar, .jc-main, .jc-topbar, .jc-right-panel,
    .jc-input-area, .jc-msg-bubble, .jc-case-card, .jc-alert-item,
    .jc-nav-item, .jc-input-row, .jc-cmd, .jc-user-chip,
    .jc-agent-item, .jc-right-tab, .jc-agents-section {
      transition: background-color var(--theme-transition), border-color var(--theme-transition),
                  color var(--theme-transition), box-shadow var(--theme-transition);
    }
    body { background: var(--bg); color: var(--text1); font-family: var(--font-body); }
    .jc-root { display: flex; height: 100vh; overflow: hidden; background: var(--bg); }
    .jc-create-employee-overlay {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(9, 9, 15, 0.94);
      overflow-y: auto;
      backdrop-filter: blur(4px);
    }
    .jc-sidebar {
      width: 184px; min-width: 184px; background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow-x: visible; overflow-y: hidden;
      transition: width 0.38s var(--panel-ease), min-width 0.38s var(--panel-ease), transform 0.35s ease;
      position: relative; z-index: 6;
    }
    .jc-sidebar-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .jc-sidebar.collapsed { width: 0; min-width: 0; overflow: hidden; border-right-color: transparent; }
    .jc-sidebar.collapsed .jc-logo-info, .jc-sidebar.collapsed .jc-search,
    .jc-sidebar.collapsed .jc-section-label, .jc-sidebar.collapsed .jc-nav-label,
    .jc-sidebar.collapsed .jc-nav-badge, .jc-sidebar.collapsed .jc-agent-name { display: none; }
    .jc-sidebar.collapsed .jc-logo { padding: 16px 12px; justify-content: center; }
    .jc-sidebar.collapsed .jc-nav-item { justify-content: center; padding: 10px 8px; }
    .jc-sidebar.collapsed .jc-agent-item { justify-content: center; padding: 6px 4px; }
    .jc-sidebar.collapsed .jc-agents-section { padding: 6px 4px; }
    .jc-sidebar.collapsed .jc-agent-status-dot { display: none; }
    .jc-sidebar-toggle {
      position: fixed; top: 78px; left: 188px; z-index: 50;
      width: 32px; height: 56px; border-radius: 999px;
      background: rgba(28, 28, 40, 0.42); border: 1.5px solid rgba(234,179,8,0.32);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: rgba(234, 179, 8, 0.88); opacity: 0.92;
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1), left 0.38s var(--panel-ease),
        top 0.38s var(--panel-ease), background 220ms ease, border-color 220ms ease,
        box-shadow 220ms ease, color 220ms ease, opacity 220ms ease;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(234,179,8,0.08);
      overflow: hidden; line-height: 0; flex-shrink: 0;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .jc-sidebar-toggle.is-collapsed { left: 12px; }
    /* Barra "Atuar como" (tech): é o 1º elemento do main e cai na mesma faixa
       vertical do jc-sidebar-toggle (position:fixed, top:78px). Recuo o conteúdo
       à esquerda p/ o botão de recolher não sobrepor o rótulo — nos dois estados
       (expandido o toggle invade ~36px do main; recolhido ~44px). No mobile o
       toggle some (display:none) e o recuo volta ao normal (ver @media 768px). */
    .jc-acting-as-bar { padding: 8px 16px 8px 64px; }
    .jc-sidebar-toggle::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      background: radial-gradient(ellipse at center, rgba(234,179,8,0.18) 0%, rgba(234,179,8,0) 70%);
      opacity: 0; transition: opacity 220ms ease; pointer-events: none;
    }
    .jc-sidebar-toggle:hover {
      opacity: 1; color: var(--gold); border-color: rgba(234,179,8,0.72);
      background: rgba(28, 28, 40, 0.62); transform: translateX(2px);
      box-shadow: 0 8px 22px rgba(0,0,0,0.45), 0 0 0 2px rgba(234,179,8,0.18);
    }
    .jc-sidebar-toggle:hover::before { opacity: 1; }
    .jc-sidebar-toggle:active { transform: translateX(2px) scale(0.96); }
    .jc-sidebar-toggle:focus-visible, .jc-right-toggle-desk:focus-visible,
    .jc-nav-item:focus-visible, .jc-agent-item:focus-visible {
      outline: 2px solid var(--gold); outline-offset: 2px; box-shadow: 0 0 0 4px rgba(234,179,8,0.18);
    }
    .jc-toggle-arrow {
      width: 14px; height: 14px; user-select: none; display: flex;
      align-items: center; justify-content: center;
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .jc-toggle-arrow svg { width: 100%; height: 100%; display: block; }
    .jc-sidebar-toggle.is-collapsed .jc-toggle-arrow { transform: rotate(180deg); }
    .jc-right-toggle-desk.is-collapsed .jc-toggle-arrow { transform: rotate(180deg); }
    .jc-sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
    .jc-logo {
      padding: 18px 14px 14px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .jc-sidebar:not(.collapsed) .jc-logo { padding-right: 14px; }
    .jc-sidebar.collapsed .jc-logo { padding-left: 10px; padding-right: 12px; }
    .jc-logo-mark {
      width: 30px; height: 30px; min-width: 30px;
      background: linear-gradient(145deg, var(--gold) 0%, var(--gold2) 100%);
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; color: var(--logo-text);
      font-family: var(--font-spartan); font-size: 16px; font-weight: 800;
      line-height: 1; letter-spacing: -0.03em; padding-top: 1px;
      box-shadow: 0 2px 8px rgba(234, 179, 8, 0.2); user-select: none;
    }
    .jc-logo-text {
      font-family: var(--font-brand); font-size: 22px; font-weight: 700;
      letter-spacing: 0.02em; line-height: 1; color: #ffffff;
      text-shadow: none; transition: opacity var(--theme-transition);
    }
    .jc-logo-text.offline { opacity: 0.85; }
    .jc-logo-sub { font-size: 9px; color: var(--text3); letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
    .jc-search {
      margin: 12px 12px 8px; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; gap: 8px;
    }
    .jc-search:hover { border-color: var(--border2); }
    .jc-search input {
      background: none; border: none; outline: none;
      font-family: var(--font-body); font-size: 12px; color: var(--text2); width: 100%;
    }
    .jc-search input::placeholder { color: var(--text3); }
    .jc-nav { flex: 1; overflow-y: auto; padding: 4px 8px 8px; }
    .jc-nav::-webkit-scrollbar { width: 4px; }
    .jc-nav::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }
    .jc-section-label {
      font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--text3); padding: 12px 8px 4px; font-weight: 600;
    }
    .jc-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 8px; cursor: pointer;
      transition: background 0.15s; margin-bottom: 1px;
    }
    .jc-nav-item:hover { background: var(--bg4); }
    .jc-nav-item.active { background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.15); }
    /* Cabeçalho do grupo é um <button>: zera o estilo nativo do botão */
    .jc-nav-group-header {
      width: 100%; background: transparent; border: none;
      font-family: inherit; color: var(--text1); text-align: left;
    }
    .jc-nav-group-header.expanded { background: var(--bg3); }
    .jc-nav-chevron { margin-left: auto; flex-shrink: 0; transition: transform 0.3s ease; }
    .jc-nav-group-header.expanded .jc-nav-chevron { transform: rotate(180deg); }
    /* Slide suave via CSS grid (0fr -> 1fr). O filho direto PRECISA de
       overflow:hidden + min-height:0 para colapsar de fato. Espaçamento
       vertical fica em padding (dentro do overflow) para não "pular". */
    .jc-nav-subwrap {
      display: grid; grid-template-rows: 0fr;
      transition: grid-template-rows 0.3s ease;
    }
    .jc-nav-subwrap.open { grid-template-rows: 1fr; }
    .jc-nav-subitems {
      overflow: hidden; min-height: 0;
      display: flex; flex-direction: column;
      margin-left: 8px; padding: 2px 0 4px 8px;
      border-left: 1px solid var(--border);
      opacity: 0; transition: opacity 0.3s ease;
    }
    .jc-nav-subwrap.open .jc-nav-subitems { opacity: 1; }
    .jc-nav-subitem { padding-left: 10px; }
    @media (prefers-reduced-motion: reduce) {
      .jc-nav-subwrap, .jc-nav-subitems, .jc-nav-chevron { transition: none; }
    }
    .jc-sidebar.collapsed .jc-nav-chevron { display: none; }
    .jc-sidebar.collapsed .jc-nav-subitems { margin-left: 0; padding-left: 0; border-left: none; }
    .jc-sidebar.collapsed .jc-nav-subitem { padding-left: 8px; }
    .jc-session-del { opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s; }
    .jc-session-item:hover .jc-session-del, .jc-session-item:focus-within .jc-session-del { opacity: 0.7; }
    .jc-session-del:hover { opacity: 1 !important; color: #ef4444 !important; background: rgba(239,68,68,0.12) !important; }
    .jc-nav-label { font-size: 13px; font-weight: 400; color: var(--text1); flex: 1; }
    .jc-nav-label--brand { font-family: var(--font-spartan); font-weight: 700; letter-spacing: -0.01em; font-size: 14px; }
    .jc-nav-badge {
      font-size: 10px; font-family: var(--font-mono);
      background: var(--badge-bg); border-radius: 10px;
      padding: 1px 7px; color: var(--text2); min-width: 22px; text-align: center;
    }
    .jc-nav-badge.alert { background: rgba(234,179,8,0.16); color: #FEF08A; border: 1px solid rgba(234,179,8,0.35); }
    .jc-agents-section {
      padding: 8px; border-top: 1px solid var(--border); flex-shrink: 0;
      max-height: 38vh; overflow-x: visible; overflow-y: auto;
    }
    .jc-agent-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      border: none; background: transparent; font: inherit; color: inherit; text-align: left;
      padding: 6px 8px; border-radius: 8px; cursor: pointer; position: relative; z-index: 0;
      transition: transform 0.22s ease, background 0.2s ease, box-shadow 0.22s ease;
    }
    .jc-agents-section .jc-agent-item:hover {
      background: var(--bg3); transform: scale(1.045); z-index: 2;
      box-shadow: 0 10px 28px rgba(0,0,0,0.38);
    }
    .jc-agent-avatar {
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; font-family: var(--font-body); flex-shrink: 0;
    }
    .jc-agent-name { font-size: 11px; color: var(--text2); flex: 1; line-height: 1.2; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .jc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; position: relative; z-index: 1; }
    .jc-topbar {
      min-height: 52px; height: auto; background: var(--bg2);
      border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap;
      align-items: center; padding: 10px 16px 12px; gap: 10px 12px; box-sizing: border-box;
    }
    .jc-topbar-brand { flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .jc-dept-title {
      font-family: var(--font-spartan); font-size: clamp(15px, 2.4vw, 20px); font-weight: 700;
      letter-spacing: -0.01em; color: var(--text1); display: flex; align-items: center;
      gap: 8px; min-width: 0; line-height: 1.2;
    }
    .jc-dept-icon { flex-shrink: 0; }
    .jc-dept-title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jc-dept-sub { font-size: 11px; color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
    .jc-topbar-trailing {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;
      gap: 8px 10px; flex: 1 1 220px; min-width: 0;
    }
    .jc-user-chip {
      display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px;
      background: var(--bg3); border: 1px solid var(--border); border-radius: 20px; cursor: pointer;
    }
    .jc-user-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: var(--logo-text); font-family: var(--font-disp);
    }
    .jc-user-name { font-size: 12px; color: var(--text1); }
    .jc-btn-create-user {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
      border: 1px solid rgba(234, 179, 8, 0.5); cursor: pointer; font-family: var(--font-body);
      font-size: 12px; font-weight: 700; color: #0a0a12;
      background: linear-gradient(145deg, var(--gold) 0%, var(--gold2) 100%);
      box-shadow: 0 0 16px rgba(234, 179, 8, 0.28); flex-shrink: 0;
      transition: filter 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .jc-btn-create-user:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 0 20px rgba(234, 179, 8, 0.4); }
    .jc-btn-team-list {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
      border: 1px solid rgba(234, 179, 8, 0.45); cursor: pointer; font-family: var(--font-body);
      font-size: 12px; font-weight: 600; color: #facc15; background: rgba(234, 179, 8, 0.08);
      flex-shrink: 0; transition: filter 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .jc-btn-team-list:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 0 16px rgba(234, 179, 8, 0.28); }
    .jc-onboarding-banner {
      display: flex; align-items: center; gap: 12px; margin: 10px 16px 0; padding: 12px 14px;
      background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.30);
      border-radius: 12px; color: var(--text1); font-size: 13px;
    }
    .jc-onboarding-cta {
      background: var(--gold); color: var(--logo-text); border: none; border-radius: 8px;
      padding: 8px 14px; font-weight: 600; font-size: 12px; cursor: pointer;
      transition: filter 0.15s; white-space: nowrap;
    }
    .jc-onboarding-cta:hover { filter: brightness(1.1); }
    .jc-messages { flex: 1; overflow-y: auto; padding: 24px 0; scroll-behavior: smooth; }
    .jc-messages::-webkit-scrollbar { width: 4px; }
    .jc-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    .jc-msg-wrap {
      display: flex; gap: 12px; padding: 8px 32px; max-width: 960px; margin: 0 auto;
      animation: fadeUp 0.3s ease both;
    }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .jc-msg-wrap.user { flex-direction: row-reverse; }
    .jc-msg-avatar {
      width: 32px; height: 32px; min-width: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; font-family: var(--font-body);
    }
    .jc-msg-bubble {
      /* Dimensionamento por CARACTERE, não por fração do pai. width:fit-content
         faz o balão medir SÓ o conteúdo; o teto é 70ch (~80 caracteres reais em
         Plus Jakarta Sans 14px cabem numa linha; medido: 80 chars ≈ 65-69ch),
         limitado a 75vw em telas estreitas.
         POR QUE ch/vw e NÃO %: um max-width em % é resolvido contra a largura do
         wrapper-coluna pai — que por sua vez é derivada do conteúdo do balão
         (dependência circular) e pode colapsar (o pai tem min-width:0). Quando
         isso acontecia, 88% virava ~2px e o max-width FURAVA o piso do
         min-content, forçando "físi/ca" e "1234/5678/910". ch/vw não dependem do
         pai: curto NUNCA quebra; só passa de ~80 caracteres quebra, no espaço. */
      width: fit-content; max-width: min(70ch, 75vw);
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.7; color: var(--text1);
      /* Quebra só palavras REALMENTE longas (URLs/tokens) quando não couberem;
         nunca corta no meio de palavras curtas. break-all quebraria sempre. */
      white-space: normal; overflow-wrap: break-word; word-break: normal; hyphens: none;
    }
    /* Mensagem do usuário: balão encostado à direita (junto do avatar). Como o
       balão agora é fit-content, sem isto ele ficaria alinhado à esquerda da coluna. */
    .jc-msg-wrap.user .jc-msg-bubble {
      background: var(--user-bubble-bg); border-color: var(--user-bubble-border);
      align-self: flex-end;
    }
    /* ── ActionCard — proposta de ação (cadastro etc.), visual "Modelo B" ──
       Quadro âmbar destacado, campos rotulados um a um com faixas escuras
       alternadas e botões com hover/clique. */
    .action-card {
      max-width: 560px; margin: 10px 32px; overflow: hidden;
      background: var(--bg2, #16161f);
      border: 1px solid rgba(234,179,8,0.45); border-radius: 14px;
      box-shadow: 0 0 0 1px rgba(234,179,8,0.06), 0 10px 26px rgba(0,0,0,0.38);
      animation: fadeUp 0.3s ease both;
    }
    .action-card__head {
      display: flex; align-items: center; gap: 8px; padding: 12px 16px;
      background: rgba(234,179,8,0.10); border-bottom: 1px solid rgba(234,179,8,0.28);
      font-family: var(--font-body); font-weight: 700; font-size: 13px; color: #FACC15;
      letter-spacing: 0.02em;
    }
    .action-card__note {
      padding: 8px 16px 0; font-size: 11.5px; color: var(--text3, #8a8a99); line-height: 1.4;
    }
    .action-card__fields { display: flex; flex-direction: column; padding: 4px 0; }
    .action-card__row {
      display: flex; gap: 12px; align-items: baseline; padding: 9px 16px;
    }
    /* Faixa escura contrastante alternada entre os campos. */
    .action-card__row:nth-child(odd) { background: rgba(0,0,0,0.28); }
    .action-card__label {
      min-width: 96px; flex-shrink: 0; color: var(--text3, #8a8a99);
      font-family: var(--font-body); font-size: 10.5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .action-card__value {
      flex: 1; min-width: 0; color: var(--text1, #e4e4e7); font-size: 13.5px; font-weight: 500;
      overflow-wrap: break-word; word-break: normal;
    }
    .action-card__desc {
      padding: 12px 16px; font-size: 13.5px; color: var(--text1, #e4e4e7);
      line-height: 1.5; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal;
    }
    .action-card__actions {
      display: flex; gap: 10px; padding: 12px 16px;
      border-top: 1px solid var(--border, rgba(255,255,255,0.08));
    }
    .action-card__btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 16px; border-radius: 10px; border: 1px solid transparent;
      font-family: var(--font-body); font-size: 13px; font-weight: 700; cursor: pointer;
      transition: filter .15s ease, transform .1s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
    }
    .action-card__btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .action-card__btn--primary {
      background: var(--gold, #EAB308); color: var(--logo-text, #1a1a10); border-color: rgba(234,179,8,0.6);
    }
    .action-card__btn--primary:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 0 18px rgba(234,179,8,0.38); }
    .action-card__btn--primary:not(:disabled):active { transform: translateY(0) scale(0.98); filter: brightness(0.94); box-shadow: none; }
    .action-card__btn--ghost {
      background: rgba(255,255,255,0.04); color: var(--text2, #cbd5e1); border-color: rgba(148,163,184,0.35);
    }
    .action-card__btn--ghost:not(:disabled):hover { background: rgba(255,255,255,0.09); border-color: rgba(148,163,184,0.6); transform: translateY(-1px); }
    .action-card__btn--ghost:not(:disabled):active { transform: translateY(0) scale(0.98); background: rgba(255,255,255,0.05); }
    .action-card--done {
      max-width: 560px; margin: 10px 32px; padding: 12px 16px;
      display: flex; align-items: center; gap: 8px;
      background: rgba(234,179,8,0.06); border: 1px solid rgba(234,179,8,0.25); border-radius: 12px;
      font-size: 13px; color: var(--text2, #cbd5e1); line-height: 1.45;
    }
    .jc-msg-meta {
      font-size: 10px; color: var(--text3); margin-bottom: 4px;
      font-family: var(--font-body); display: flex; align-items: center; gap: 6px;
    }
    .jc-msg-meta .agent-tag {
      font-size: 10px; padding: 2px 8px; border-radius: 4px;
      background: rgba(234,179,8,0.12); color: var(--gold); border: 1px solid rgba(234,179,8,0.28);
      font-family: var(--font-body); font-weight: 500; letter-spacing: 0.02em;
    }
    .jc-msg-text b, .jc-msg-text strong { color: var(--gold2); font-weight: 600; }
    .jc-card-processes { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .jc-process-row {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 10px;
      padding: 11px 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.2s;
    }
    .jc-process-row:hover { border-color: var(--border2); background: var(--bg3); }
    .jc-process-id { font-family: var(--font-body); font-size: 10px; color: var(--text3); min-width: 72px; }
    .jc-process-client { font-size: 12.5px; font-weight: 500; flex: 1; color: var(--text1); }
    .jc-process-area { font-size: 10px; padding: 2px 8px; border-radius: 5px; }
    .jc-process-prazo { font-family: var(--font-body); font-size: 10px; }
    .jc-process-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .jc-process-badge.urgente { background: rgba(234,179,8,0.18); color: #FEF08A; border: 1px solid rgba(250,204,21,0.45); }
    .jc-process-badge.normal { background: rgba(255,255,255,0.06); color: #e4e4e7; border: 1px solid rgba(255,255,255,0.14); }
    .jc-process-badge.revisar { background: rgba(250,204,21,0.12); color: #FACC15; border: 1px solid rgba(250,204,21,0.35); }
    .jc-process-value { font-family: var(--font-body); font-size: 11px; color: #FACC15; min-width: 80px; text-align: right; font-weight: 600; }
    .jc-thinking { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
    .jc-thinking span {
      width: 6px; height: 6px; border-radius: 50%; background: var(--gold);
      animation: thinking 1.2s infinite; display: inline-block;
    }
    .jc-thinking span:nth-child(2) { animation-delay: 0.2s; }
    .jc-thinking span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes thinking { 0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1.2); } }
    .jc-input-area { background: var(--bg2); border-top: 1px solid var(--border); padding: 12px 32px 16px; }
    .jc-commands { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .jc-cmd {
      font-size: 11px; padding: 5px 12px; border-radius: 16px;
      background: var(--bg3); border: 1px solid var(--border2);
      color: var(--text2); cursor: pointer; white-space: nowrap; transition: all 0.15s;
      font-family: var(--font-body); display: flex; align-items: center; gap: 4px;
    }
    .jc-cmd:hover { background: rgba(234,179,8,0.08); border-color: rgba(234,179,8,0.25); color: var(--gold2); }
    .jc-input-row {
      display: flex; align-items: flex-end; gap: 10px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 14px; padding: 10px 14px; transition: border-color 0.2s;
    }
    .jc-input-row:focus-within { border-color: rgba(234,179,8,0.4); }
    .jc-textarea {
      flex: 1; background: none; border: none; outline: none; resize: none;
      font-family: var(--font-body); font-size: 14px; color: var(--text1);
      line-height: 1.5; max-height: 120px; min-height: 22px; text-align: left;
    }
    .jc-textarea::placeholder { color: var(--text3); text-align: left; }
    .jc-send-btn, .jc-mic-btn {
      width: 34px; height: 34px; border-radius: 9px; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; flex-shrink: 0; line-height: 0; padding: 0;
    }
    .jc-send-btn::before, .jc-send-btn::after, .jc-mic-btn::before, .jc-mic-btn::after { content: none !important; }
    .jc-send-btn > svg, .jc-mic-btn > svg { display: block; flex-shrink: 0; }
    .jc-send-btn { background: linear-gradient(135deg, var(--gold), var(--gold2)); color: #0a0a12; }
    .jc-send-btn:hover { transform: scale(1.05); box-shadow: 0 0 16px rgba(234,179,8,0.4); }
    .jc-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
    .jc-mic-btn { background: var(--bg4); color: var(--text2); border: 1px solid var(--border); }
    .jc-mic-btn:hover { border-color: var(--gold); color: var(--gold); }
    .jc-mic-btn.recording { background: rgba(234,179,8,0.18); border-color: #EAB308; color: #FEF9C3; animation: pulse 1s infinite; }
    .jc-mic-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .jc-mic-btn:disabled:hover { border-color: var(--border); color: var(--text2); }
    .jc-input-hint { font-size: 10px; color: var(--text3); text-align: center; margin-top: 6px; }
    .jc-right-panel {
      width: 320px; min-width: 320px; background: var(--bg2);
      border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden;
      transition: width 0.38s var(--panel-ease), min-width 0.38s var(--panel-ease), opacity 0.3s ease;
      position: relative; z-index: 5;
    }
    .jc-right-panel.collapsed { width: 0; min-width: 0; border-left: none; }
    .jc-right-panel.collapsed > *:not(.jc-right-toggle-desk) { display: none; }
    .jc-right-toggle-desk {
      position: fixed; top: 78px; right: 324px; z-index: 55;
      width: 32px; height: 56px; border-radius: 999px;
      background: rgba(28, 28, 40, 0.42); border: 1.5px solid rgba(234,179,8,0.32);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: rgba(234, 179, 8, 0.88); opacity: 0.92;
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1), right 0.38s var(--panel-ease),
        top 0.38s var(--panel-ease), background 220ms ease, border-color 220ms ease,
        box-shadow 220ms ease, color 220ms ease, opacity 220ms ease;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(234,179,8,0.08);
      overflow: hidden; line-height: 0; flex-shrink: 0;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .jc-right-toggle-desk.is-collapsed { right: 8px; top: 78px; }
    .jc-right-toggle-desk::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      background: radial-gradient(ellipse at center, rgba(234,179,8,0.18) 0%, rgba(234,179,8,0) 70%);
      opacity: 0; transition: opacity 220ms ease; pointer-events: none;
    }
    .jc-right-toggle-desk:hover {
      opacity: 1; color: var(--gold); border-color: rgba(234,179,8,0.72);
      background: rgba(28, 28, 40, 0.62); transform: translateX(-2px);
      box-shadow: 0 8px 22px rgba(0,0,0,0.45), 0 0 0 2px rgba(234,179,8,0.18);
    }
    .jc-right-toggle-desk:hover::before { opacity: 1; }
    .jc-right-toggle-desk:active { transform: translateX(-2px) scale(0.96); }
    .jc-right-header {
      padding: 16px 16px 12px 16px; border-bottom: 1px solid var(--border);
      font-family: var(--font-spartan); font-size: 16px; font-weight: 700;
      letter-spacing: -0.01em; color: var(--text1);
    }
    .jc-right-tabs { display: flex; border-bottom: 1px solid var(--border); padding: 0 12px; }
    .jc-right-tab {
      font-size: 11px; padding: 9px 12px; cursor: pointer; color: var(--text3);
      border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap;
      font-weight: 500; display: flex; align-items: center; gap: 4px;
    }
    .jc-right-tab.active { color: var(--gold); border-color: var(--gold); }
    .jc-right-body { flex: 1; overflow-y: auto; padding: 12px; }
    .jc-right-body::-webkit-scrollbar { width: 3px; }
    .jc-right-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .jc-case-card, .jc-agent-card-rp {
      background: var(--bg3); border: 1px solid var(--card-border);
      border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;
    }
    .jc-case-card:hover, .jc-agent-card-rp:hover { border-color: var(--card-border-hover); background: var(--bg4); }
    .jc-case-num { font-family: var(--font-body); font-size: 10px; color: var(--text3); margin-bottom: 4px; }
    .jc-case-name { font-size: 13px; font-weight: 500; color: var(--text1); margin-bottom: 6px; }
    .jc-case-row { display: flex; justify-content: space-between; align-items: center; }
    .jc-case-prazo-row { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text3); margin-top: 6px; }
    .jc-alert-item {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 10px; border-radius: 8px; margin-bottom: 6px; border: 1px solid; cursor: pointer;
    }
    .jc-alert-item.fatal { background: rgba(234,179,8,0.06); border-color: rgba(250,204,21,0.35); }
    .jc-alert-item.warning { background: rgba(234,179,8,0.05); border-color: rgba(234,179,8,0.28); }
    .jc-alert-item.info { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.12); }
    .jc-alert-item.success { background: rgba(250,204,21,0.06); border-color: rgba(250,204,21,0.3); }
    .jc-alert-text { font-size: 11.5px; color: var(--text1); line-height: 1.4; flex: 1; }
    .jc-alert-time { font-size: 9px; color: var(--text3); font-family: var(--font-body); white-space: nowrap; }
    .jc-sidebar-overlay { display: none; position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.5); }
    .jc-sidebar-overlay.visible { display: block; }
    .jc-tooltip-overlay {
      position: fixed; inset: 0; z-index: 45; background: rgba(0,0,0,0.45);
      backdrop-filter: blur(1px); pointer-events: none; animation: jcTooltipFade 120ms ease-out;
    }
    @keyframes jcTooltipFade { from { opacity: 0 } to { opacity: 1 } }
    .jc-hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--text1); padding: 4px; flex-shrink: 0; }
    .jc-right-toggle { display: none; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 11px; color: var(--text2); align-items: center; gap: 4px; }
    * { scrollbar-color: var(--border) transparent; scrollbar-width: thin; }
    @media (max-width: 1024px) {
      .jc-right-panel { display: none; }
      .jc-right-panel.mobile-visible {
        display: flex; position: fixed; right: 0; top: 0; bottom: 0; z-index: 50;
        width: min(320px, 90vw); box-shadow: -4px 0 24px rgba(0,0,0,0.3);
      }
      .jc-right-panel.mobile-visible.collapsed { width: 0; min-width: 0; border-left: none; overflow: hidden; }
      .jc-right-panel.mobile-visible.collapsed > *:not(.jc-right-toggle-desk) { display: none; }
      .jc-right-toggle-desk { display: flex !important; right: 8px; }
      .jc-right-toggle-desk.is-panel-open:not(.is-collapsed) { right: min(320px, 90vw); }
    }
    @media (max-width: 768px) {
      .jc-sidebar {
        position: fixed; left: 0; top: 0; bottom: 0; z-index: 50;
        transform: translateX(-100%); box-shadow: 4px 0 24px rgba(0,0,0,0.3);
        width: 240px !important; min-width: 240px !important;
      }
      .jc-sidebar.mobile-open { transform: translateX(0); }
      .jc-sidebar.collapsed .jc-logo-info, .jc-sidebar.collapsed .jc-search,
      .jc-sidebar.collapsed .jc-section-label, .jc-sidebar.collapsed .jc-nav-label,
      .jc-sidebar.collapsed .jc-nav-badge, .jc-sidebar.collapsed .jc-agent-name { display: revert; }
      .jc-sidebar-toggle { display: none; }
      /* Toggle escondido no mobile → sem sobreposição, recuo volta ao normal. */
      .jc-acting-as-bar { padding-left: 16px; }
      .jc-sidebar-overlay.visible { display: block; }
      .jc-hamburger { display: block; }
      .jc-topbar { padding: 8px 10px 10px; gap: 8px; }
      .jc-topbar-brand { flex-basis: 100%; }
      .jc-topbar-trailing { flex-basis: 100%; justify-content: flex-start; }
      .jc-dept-title { font-size: 16px; }
      .jc-msg-wrap { padding: 8px 16px; }
      /* Mesmo racional do desktop: teto por caractere (não %) para não colapsar.
         Em mobile deixamos ir a 88vw para aproveitar a tela estreita. */
      .jc-msg-bubble { max-width: min(70ch, 88vw); font-size: 13px; }
      .jc-input-area { padding: 8px 12px 12px; }
      .jc-cmd { font-size: 10px; padding: 3px 8px; }
    }
    @media (max-width: 480px) {
      .jc-user-chip { display: none; }
    }
  `}</style>
);

export default GlobalStyles;
