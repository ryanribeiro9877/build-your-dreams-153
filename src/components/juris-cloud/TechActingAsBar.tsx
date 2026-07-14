import React from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { type TestableSector, sectorLabel } from "@/hooks/useTechTest";

/**
 * Barra "Atuar como setor" (só tech) exibida no topo da conversa.
 *
 * O tech escolhe um SETOR (usuário-alvo) e passa a conversar com os agentes
 * daquele setor como se fosse o dono. "Meu tech" (default) = sessão normal do
 * próprio tech. Quando um setor está selecionado, a conversa é uma sessão de
 * teste (is_tech_test) — o badge deixa isso explícito e o backend faz dry-run
 * (nenhuma escrita de negócio é gravada).
 */
export interface TechActingAsBarProps {
  sectors: TestableSector[];
  /** Alvo atual (dono) do teste, ou null = "Meu tech" (sessão normal). */
  activeTarget: TestableSector | null;
  onSelect: (target: TestableSector | null) => void;
  /** Trava o seletor enquanto uma geração está em andamento nesta conversa. */
  disabled?: boolean;
}

export default function TechActingAsBar({ sectors, activeTarget, onSelect, disabled }: TechActingAsBarProps) {
  const isTest = !!activeTarget;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) { onSelect(null); return; }
    const found = sectors.find((s) => s.user_id === id) ?? null;
    onSelect(found);
  };

  return (
    <div
      className="jc-acting-as-bar"
      style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "8px 16px",
        borderBottom: "1px solid var(--border, #1e1e2e)",
        background: isTest ? "rgba(234,179,8,0.06)" : "transparent",
      }}
    >
      <label
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontSize: 12, color: "var(--text3, #94A3B8)", fontWeight: 600,
        }}
      >
        <FlaskConical size={14} aria-hidden style={{ color: "#EAB308", flexShrink: 0 }} />
        <span>Atuar como:</span>
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          <select
            value={activeTarget?.user_id ?? ""}
            onChange={handleChange}
            disabled={disabled}
            aria-label="Atuar como setor (teste de agentes)"
            style={{
              appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
              padding: "5px 28px 5px 10px", borderRadius: 8,
              border: `1px solid ${isTest ? "rgba(234,179,8,0.5)" : "var(--border, #2a2a3a)"}`,
              background: "var(--bg2, #0f0f1a)",
              color: isTest ? "#EAB308" : "var(--text2, #cbd5e1)",
              fontSize: 12, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1, fontFamily: "inherit", maxWidth: 260,
            }}
          >
            <option value="">Meu tech</option>
            {sectors.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {sectorLabel(s)}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            aria-hidden
            style={{ position: "absolute", right: 8, pointerEvents: "none", color: "var(--text3, #94A3B8)" }}
          />
        </span>
      </label>

      {isTest && (
        <span
          role="status"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 8,
            border: "1px dashed rgba(234,179,8,0.6)",
            background: "rgba(234,179,8,0.10)",
            color: "#EAB308", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.01em",
          }}
        >
          <FlaskConical size={12} aria-hidden />
          TESTE — atuando como {sectorLabel(activeTarget)} · nada é gravado
        </span>
      )}
    </div>
  );
}
