import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useMasterAdmin() {
  const { user, loading: authLoading, hasRole } = useAuth();
  const [isMaster, setIsMaster] = useState(false);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setIsMaster(false);
      setChecking(false);
      return;
    }
    const directorMaster = hasRole("director");

    if (!directorMaster && !hasRole("admin")) {
      setIsMaster(false);
      setChecking(false);
      return;
    }
    setChecking(true);

    let profileSocio = false;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role_template_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.role_template_id) {
      const { data: rt } = await supabase
        .from("role_templates" as "agents")
        .select("code")
        .eq("id", profile.role_template_id)
        .maybeSingle();
      profileSocio = (rt as { code?: string } | null)?.code === "socio";
    }

    const { data, error } = await supabase.rpc("is_master_admin", { _user_id: user.id });
    if (error) {
      setIsMaster(directorMaster || profileSocio);
    } else {
      setIsMaster(Boolean(data) || directorMaster || profileSocio);
    }
    setChecking(false);
  }, [user, hasRole]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  return { isMaster, checking, refresh };
}
