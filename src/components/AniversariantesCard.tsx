import { useState } from "react";
import { Link } from "react-router-dom";
import { useAniversariantes } from "@/hooks/useAniversariantes";
import {
  DEFAULT_BIRTHDAY_TEMPLATE,
  renderBirthdayMessage,
  waMeUrl,
  telHref,
} from "@/lib/aniversariantes";

/**
 * Card "🎂 Aniversariantes do dia" — inspirado no LegalOne, exibido no painel
 * inicial (WelcomeScreen) APENAS para a recepção. O gate de papel vive no
 * chamador (isRecepcaoRole, 1:1 com is_recepcao() do banco): este componente só
 * é montado quando é recepção, então a RPC gated nunca dispara 42501 aqui.
 *
 * A mensagem de parabéns é editável em sessão (template com {nome}); os botões
 * abrem o WhatsApp com o texto já preenchido — quem envia é a recepção.
 */
export default function AniversariantesCard() {
  const { data, loading, error } = useAniversariantes();
  const [template, setTemplate] = useState(DEFAULT_BIRTHDAY_TEMPLATE);
  const [editing, setEditing] = useState(false);

  return (
    <section className="aniv-card" aria-labelledby="aniv-title">
      <div className="aniv-head">
        <h2 id="aniv-title" className="aniv-title">🎂 Aniversariantes do dia</h2>
        {data.length > 0 && (
          <button
            type="button"
            className="aniv-edit-toggle"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            {editing ? "Fechar" : "✏️ Editar mensagem"}
          </button>
        )}
      </div>

      {editing && (
        <div className="aniv-editor">
          <label htmlFor="aniv-template" className="aniv-editor-label">
            Mensagem enviada no WhatsApp — <code>{"{nome}"}</code> vira o primeiro nome do cliente.
          </label>
          <textarea
            id="aniv-template"
            className="aniv-editor-input"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={3}
          />
        </div>
      )}

      {loading ? (
        <div className="aniv-empty">Carregando aniversariantes…</div>
      ) : error ? (
        <div className="aniv-empty">Não foi possível carregar os aniversariantes agora.</div>
      ) : data.length === 0 ? (
        <div className="aniv-empty">Nenhum aniversariante hoje.</div>
      ) : (
        <ul className="aniv-list">
          {data.map((a) => {
            const mensagem = renderBirthdayMessage(template, a.nome);
            return (
              <li key={a.client_id} className="aniv-row">
                <div className="aniv-person">
                  <Link to={`/clientes/${a.client_id}`} className="aniv-name">
                    {a.nome}
                  </Link>
                  <span className="aniv-age">
                    faz {a.idade} ano{a.idade === 1 ? "" : "s"} hoje
                  </span>
                </div>

                {a.is_whatsapp ? (
                  <a
                    className="aniv-wa"
                    href={waMeUrl(a.telefone, mensagem)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    💬 Parabenizar no WhatsApp
                  </a>
                ) : a.telefone ? (
                  <a className="aniv-tel" href={telHref(a.telefone)}>
                    📞 {a.telefone}
                  </a>
                ) : (
                  <span className="aniv-tel aniv-tel--none">sem telefone</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <style>{`
        .aniv-card {
          width: 100%;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px 18px;
          margin-top: 4px;
          text-align: left;
        }
        .aniv-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
        }
        .aniv-title {
          font-family: var(--font-spartan, var(--font-disp));
          font-size: 14px; font-weight: 700; color: var(--gold);
          letter-spacing: 0.01em; margin: 0;
        }
        .aniv-edit-toggle {
          background: transparent; border: 1px solid var(--border);
          border-radius: 8px; padding: 4px 10px;
          color: var(--text2); font-size: 11px; cursor: pointer;
          transition: border-color 0.18s ease, color 0.18s ease;
        }
        .aniv-edit-toggle:hover { border-color: rgba(234,179,8,0.45); color: var(--gold); }

        .aniv-editor { margin-bottom: 12px; }
        .aniv-editor-label {
          display: block; font-size: 11px; color: var(--text3);
          margin-bottom: 6px; line-height: 1.4;
        }
        .aniv-editor-label code {
          background: var(--bg4); border-radius: 4px; padding: 1px 5px;
          color: var(--gold); font-size: 11px;
        }
        .aniv-editor-input {
          width: 100%; box-sizing: border-box;
          background: var(--bg2, var(--bg1)); border: 1px solid var(--border);
          border-radius: 10px; padding: 8px 10px;
          color: var(--text1); font-family: var(--font-body);
          font-size: 13px; line-height: 1.5; resize: vertical;
        }
        .aniv-editor-input:focus {
          outline: none; border-color: rgba(234,179,8,0.55);
        }

        .aniv-empty {
          font-size: 13px; color: var(--text3);
          padding: 8px 0; line-height: 1.5;
        }

        .aniv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .aniv-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
          padding: 10px 12px;
          background: var(--bg2, rgba(255,255,255,0.02));
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .aniv-person { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .aniv-name {
          color: var(--text1); font-size: 14px; font-weight: 600;
          text-decoration: none;
        }
        .aniv-name:hover { color: var(--gold); text-decoration: underline; }
        .aniv-age { font-size: 12px; color: var(--text3); }

        .aniv-wa {
          flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--gold); color: #0a0a12;
          border-radius: 10px; padding: 7px 12px;
          font-size: 12px; font-weight: 600; text-decoration: none;
          transition: filter 0.18s ease, transform 0.12s ease;
        }
        .aniv-wa:hover { filter: brightness(1.05); transform: translateY(-1px); }

        .aniv-tel {
          flex-shrink: 0; font-size: 13px; color: var(--text2);
          text-decoration: none;
        }
        .aniv-tel:hover { color: var(--gold); }
        .aniv-tel--none { color: var(--text3); font-style: italic; }
      `}</style>
    </section>
  );
}
