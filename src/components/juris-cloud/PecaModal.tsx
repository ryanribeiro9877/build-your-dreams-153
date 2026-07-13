import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { downloadMessageAsPdf } from "@/lib/messageToPdf";
import { downloadMessageAsDocx } from "@/lib/bacellarDocx";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { isPecaAuthor } from "@/lib/pecaAccess";
import { SalvarMinutaModal } from "./SalvarMinutaModal";

// Painel/modal que exibe a PEÇA COMPLETA fora do fluxo do chat.
//
// O balão do chat mostra só um trecho (as primeiras linhas). Ao clicar em
// "Ver peça completa", abrimos a peça inteira aqui — rolável, legível e fechável
// (X, ESC ou clique fora) — mantendo a conversa limpa. A expansão vive NESTE
// painel, não no balão: ao fechar, o chat volta ao trecho de 10 linhas.
//
// Reaproveita as mesmas ações de download do chat (PDF e DOCX padrão Bacellar),
// que baixam a peça COMPLETA — nunca o trecho.

export interface PecaModalProps {
  /** Texto COMPLETO da peça (não o trecho truncado). */
  content: string;
  /** Nome do agente que gerou a peça (usado no PDF e no cabeçalho). */
  agentName?: string;
  onClose: () => void;
}

export function PecaModal({ content, agentName, onClose }: PecaModalProps) {
  const [showSave, setShowSave] = useState(false);
  // Só advogado/sócio criam/anexam peça. Recepção só visualiza (a peça já
  // anexada abre na aba Documentos do cliente) — não vê "Salvar no cliente".
  // O backend bloqueia o INSERT de qualquer forma; aqui é para não mostrar um
  // botão que iria falhar.
  const { workspace } = useMyWorkspace();
  const canSave = isPecaAuthor(workspace?.role_template?.code);

  // Fecha com ESC e trava o scroll do fundo enquanto o painel está aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const btnBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
    fontWeight: 600,
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Peça completa${agentName ? ` — ${agentName}` : ""}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "fadeUp 0.18s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg2, #11111a)",
          border: "1px solid var(--border, #25253a)",
          borderRadius: 14,
          width: "min(860px, 100%)",
          maxHeight: "min(88vh, 100%)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Cabeçalho fixo: título, downloads (peça completa) e fechar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px", borderBottom: "1px solid var(--border, #25253a)",
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text1, #eeeef5)" }}>
              Peça completa
            </div>
            {agentName && (
              <div style={{ fontSize: 11, color: "var(--text3, #7a7a92)", marginTop: 1 }}>
                {agentName}
              </div>
            )}
          </div>
          {canSave && (
            <button
              type="button"
              onClick={() => setShowSave(true)}
              title="Salvar como minuta no cadastro de um cliente"
              style={{ ...btnBase, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", color: "#34D399" }}
            >
              💾 Salvar no cliente
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadMessageAsPdf(content, { agentName, title: "peca" })}
            title="Baixar esta peça em PDF"
            style={{ ...btnBase, background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#EAB308" }}
          >
            ⬇ PDF
          </button>
          <button
            type="button"
            onClick={() => {
              downloadMessageAsDocx(content, { title: "peca" })
                .catch((e) => console.error("[docx] falha ao exportar:", e));
            }}
            title="Baixar no padrão Bacellar (.docx com logo e marca d'água)"
            style={{ ...btnBase, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)", color: "#60A5FA" }}
          >
            ⬇ DOCX
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar (Esc)"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 8, cursor: "pointer",
              background: "transparent", border: "1px solid var(--border, #25253a)",
              color: "var(--text2, #c4c4d4)", flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Corpo rolável com a peça inteira */}
        <div style={{
          overflowY: "auto", padding: "18px 22px",
          fontSize: 14, lineHeight: 1.7, color: "var(--text1, #eeeef5)",
        }}>
          <SafeMarkdown className="jc-msg-text">{content}</SafeMarkdown>
        </div>
      </div>

      {showSave && canSave && (
        <SalvarMinutaModal content={content} onClose={() => setShowSave(false)} />
      )}
    </div>,
    document.body,
  );
}
