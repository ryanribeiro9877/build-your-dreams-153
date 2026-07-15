import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EmployeeRosterRow {
  user_id: string;
  name: string;
  roleLabel: string;
}

function formatRoleLabel(
  templateName: string | null | undefined,
  isEstagiario: boolean | null | undefined,
  jobTitle: string | null | undefined,
): string {
  const base = templateName?.trim() || jobTitle?.trim() || "—";
  if (isEstagiario && base !== "—") return `${base} (estagiário)`;
  if (isEstagiario) return "Estagiário";
  return base;
}

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  job_title: string | null;
  is_estagiario?: boolean | null;
  role_template_id?: string | null;
};

export function useEmployeeRoster() {
  const [members, setMembers] = useState<EmployeeRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Só usuários ATIVOS aparecem na área de usuários/equipe. Um convidado
    // criado (link de recovery enviado) nasce 'pendente' e só passa a 'ativo'
    // depois de definir a senha — até lá ele não deve constar na lista.
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("user_id, display_name, full_name, job_title, is_estagiario, role_template_id")
      .eq("activation_status", "ativo");

    if (profilesErr) {
      setError(profilesErr.message);
      setMembers([]);
      setLoading(false);
      return;
    }

    const templateMap = new Map<string, { display_name: string; has_login: boolean }>();
    const { data: templates, error: tplErr } = await supabase
      .from("role_templates")
      .select("id, display_name, has_login");

    if (!tplErr && templates) {
      for (const t of templates as { id: string; display_name: string; has_login: boolean }[]) {
        templateMap.set(t.id, { display_name: t.display_name, has_login: t.has_login });
      }
    }

    const rows: EmployeeRosterRow[] = ((profiles ?? []) as ProfileRow[])
      .map((p) => {
        const rt = p.role_template_id ? templateMap.get(p.role_template_id) : undefined;
        if (rt && rt.has_login === false) return null;
        const name = (p.full_name?.trim() || p.display_name?.trim() || "Sem nome").trim();
        return {
          user_id: p.user_id,
          name,
          roleLabel: formatRoleLabel(rt?.display_name, p.is_estagiario, p.job_title),
        };
      })
      .filter((r): r is EmployeeRosterRow => r !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    setMembers(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    const channel = supabase
      .channel("employee-roster-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void fetchMembers();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchMembers]);

  return { members, loading, error, refetch: fetchMembers };
}
