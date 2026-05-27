import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HexagonLoader } from "@/components/HexagonLoader";
import type { RoleTemplateRow } from "@/types/jurisai";

type V14Counts = {
  roles: number;
  agents: number;
  tasks: number;
  captacao: number;
  externos: number;
};

export default function OrgModelV14() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleTemplateRow[]>([]);
  const [counts, setCounts] = useState<V14Counts | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const rolesRes = await supabase
      .from("role_templates" as "agents")
      .select("*")
      .order("sort_order", { ascending: true });

    if (rolesRes.error) {
      setError(rolesRes.error.message);
      setRoles([]);
      setCounts(null);
      setLoading(false);
      return;
    }

    const [agentsRes, tasksRes, captRes, extRes] = await Promise.all([
      supabase.from("agent_templates" as "agents").select("id", { count: "exact", head: true }),
      supabase.from("task_types" as "agents").select("id", { count: "exact", head: true }),
      supabase.from("captacao_canais" as "agents").select("id", { count: "exact", head: true }),
      supabase.from("external_collaborators" as "agents").select("id", { count: "exact", head: true }),
    ]);

    setRoles((rolesRes.data ?? []) as unknown as RoleTemplateRow[]);
    setCounts({
      roles: rolesRes.data?.length ?? 0,
      agents: agentsRes.count ?? 0,
      tasks: tasksRes.count ?? 0,
      captacao: captRes.count ?? 0,
      externos: extRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasRole("admin")) {
    return (
      <div className="min-h-screen bg-[#09090f] text-[#c4c4d4] flex items-center justify-center p-8">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-[#eeeef5] p-6"
      style={{ background: "#09090f", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="px-4 py-2 rounded-lg border border-[#25253a] bg-[#11111a] text-sm text-[#c4c4d4] hover:border-[#eab308]/40"
          >
            ← Admin
          </button>
          <h1 className="text-xl font-bold text-[#eab308] m-0">Modelo organizacional V14 — Bacellar</h1>
        </div>

        <p className="text-sm text-[#7a7a92] m-0 leading-relaxed">
          Cargos, agentes-template e tipos de tarefa seedados pela migration{" "}
          <code className="text-[#facc15]">20260527120000_v14_lexforce_org_model.sql</code>.
          A UI filtrada por usuário chega na V16; o provisionamento na V15.
        </p>

        {loading ? (
          <HexagonLoader variant="inline" label="Carregando modelo..." />
        ) : error ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
            <p className="text-sm text-[#facc15] font-semibold m-0">Migration ainda não aplicada no Supabase</p>
            <p className="text-sm text-[#c4c4d4] m-0">{error}</p>
            <ol className="text-sm text-[#7a7a92] m-0 pl-5 space-y-1 list-decimal">
              <li>Supabase Dashboard → SQL Editor</li>
              <li>Cole o arquivo <code>supabase/migrations/20260527120000_v14_lexforce_org_model.sql</code></li>
              <li>Execute e recarregue esta página</li>
            </ol>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 rounded-lg bg-[#eab308] text-[#0a0a12] text-sm font-bold"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {counts && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: "Cargos", value: counts.roles },
                  { label: "Agentes", value: counts.agents },
                  { label: "Tarefas", value: counts.tasks },
                  { label: "Captação", value: counts.captacao },
                  { label: "Externos", value: counts.externos },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-xl border border-[#25253a] bg-[#11111a] p-4 text-center"
                  >
                    <div className="text-2xl font-bold text-[#eab308]">{k.value}</div>
                    <div className="text-xs text-[#7a7a92] mt-1 uppercase tracking-wide">{k.label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-[#25253a] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#16161f] text-left text-[#7a7a92]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Código</th>
                    <th className="py-2.5 px-4 font-semibold">Cargo</th>
                    <th className="py-2.5 px-4 font-semibold">Login</th>
                    <th className="py-2.5 px-4 font-semibold">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id} className="border-t border-[#25253a]/80">
                      <td className="py-2 px-4 font-mono text-xs text-[#facc15]">{r.code}</td>
                      <td className="py-2 px-4">{r.display_name}</td>
                      <td className="py-2 px-4">{r.has_login ? "Sim" : "Não"}</td>
                      <td className="py-2 px-4">{r.is_admin ? "Sim" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
