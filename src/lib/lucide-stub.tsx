// Stub global de lucide-react: remove todos os ícones SVG do sistema.
// Cada ícone vira um componente vazio (não renderiza nada), mantendo
// a API (props como size, className, color) compatível para não quebrar.
import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  absoluteStrokeWidth?: boolean;
};

const NoopIcon = React.forwardRef<SVGSVGElement, IconProps>(() => null);
NoopIcon.displayName = "LucideIconRemoved";

// Proxy: qualquer importação nomeada retorna o NoopIcon.
const handler: ProxyHandler<Record<string, unknown>> = {
  get: (_target, prop) => {
    if (prop === "__esModule") return true;
    if (prop === "default") return NoopIcon;
    if (prop === "Icon" || prop === "createLucideIcon") return NoopIcon;
    if (prop === "icons" || prop === "dynamicIconImports") return {};
    return NoopIcon;
  },
};

const stub = new Proxy({}, handler);

// Re-export como default + named via Proxy
export default stub;
// @ts-expect-error — exportação dinâmica via Proxy
export const { /* nada nomeado estático — Proxy resolve qualquer nome */ } = stub;
module.exports = stub;
