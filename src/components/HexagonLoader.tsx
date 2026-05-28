import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import "@/styles/hexagon-loader.css";

function DashLoaderGraphic() {
  return (
    <div className="hexagon-loader__dash" aria-hidden="true">
      <svg width="16" height="12" viewBox="0 0 16 12">
        <polyline
          className="hexagon-loader__dash-back"
          points="1 6 4 6 6 11 10 1 12 6 15 6"
        />
        <polyline
          className="hexagon-loader__dash-front"
          points="1 6 4 6 6 11 10 1 12 6 15 6"
        />
      </svg>
    </div>
  );
}

export type HexagonLoaderVariant = "fullscreen" | "inline" | "compact" | "embed";

export interface HexagonLoaderProps {
  /** Texto abaixo da animação (padrão: Carregando) */
  label?: string;
  variant?: HexagonLoaderVariant;
  className?: string;
  style?: CSSProperties;
}

export function HexagonLoader({
  label = "Carregando",
  variant = "inline",
  className,
  style,
}: HexagonLoaderProps) {
  return (
    <div
      className={cn(
        "hexagon-loader",
        variant === "fullscreen" && "hexagon-loader--fullscreen",
        variant === "inline" && "hexagon-loader--inline",
        variant === "compact" && "hexagon-loader--compact",
        variant === "embed" && "hexagon-loader--embed",
        className,
      )}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <DashLoaderGraphic />
      {label ? <p className="hexagon-loader__label">{label}</p> : null}
    </div>
  );
}
