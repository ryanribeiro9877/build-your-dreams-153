import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import "@/styles/hexagon-loader.css";

function HexagonRipple() {
  return (
    <div className="hexagon" role="img" aria-hidden="true">
      {Array.from({ length: 6 }, (_, groupIndex) => (
        <div className="hexagon__group" key={groupIndex}>
          {Array.from({ length: 6 }, (_, sectorIndex) => (
            <div className="hexagon__sector" key={sectorIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}

export type HexagonLoaderVariant = "fullscreen" | "inline" | "compact";

export interface HexagonLoaderProps {
  /** Texto abaixo da animação (padrão: Carregando...) */
  label?: string;
  variant?: HexagonLoaderVariant;
  className?: string;
  style?: CSSProperties;
}

export function HexagonLoader({
  label = "Carregando...",
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
        className,
      )}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <HexagonRipple />
      <p className="hexagon-loader__label">{label}</p>
    </div>
  );
}
