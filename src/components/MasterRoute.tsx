import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PlatformPresenceSync } from "@/components/PlatformPresenceSync";
import { RequireActivation } from "@/components/RequireActivation";

/**
 * Route guard that restricts access to master admins only (via useMasterAdmin hook).
 * Redirects unauthorized users to /sistema.
 */
export function MasterRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { isMaster, checking } = useMasterAdmin();

  if (loading || checking) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isMaster) return <Navigate to="/sistema" replace />;

  return (
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
  );
}
