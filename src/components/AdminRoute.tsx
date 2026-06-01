import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PlatformPresenceSync } from "@/components/PlatformPresenceSync";

/**
 * Route guard that restricts access to users with admin, director, or socio roles.
 * Redirects unauthorized users to /sistema.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();

  if (loading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!(hasRole("admin") || hasRole("director") || hasRole("socio"))) {
    return <Navigate to="/sistema" replace />;
  }

  return (
    <>
      <PlatformPresenceSync />
      {children}
    </>
  );
}
