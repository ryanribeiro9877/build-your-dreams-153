import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import { HexagonLoader } from "@/components/HexagonLoader";
import { toast } from "sonner";
import type { RoleTemplateRow } from "@/types/jurisai";
import { getEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

const inputClass =
  "w-full px-3 py-2.5 rounded-lg bg-[#16161f] border border-[#25253a] text-[#eeeef5] text-sm outline-none focus:border-[#eab308] box-border";

export type CreateEmployeeProps = {
  /** Abre como painel sobre /sistema (não desmonta o chat). */
  embedded?: boolean;
  onClose?: () => void;
};

export default function CreateEmployee({ embedded = false, onClose }: CreateEmployeeProps) {
  const navigate = useNavigate();
  const { isMaster, checking } = useMasterAdmin();

  const exitToSistema = () => {
    if (onClose) onClose();
    else navigate("/sistema", { replace: true });
  };

  const goToLista = () => {
    if (onClose) onClose();
    navigate("/admin/funcionarios");
  };

  const [roles, setRoles] = useState<RoleTemplateRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleTemplateId, setRoleTemplateId] = useState("");
  const [isEstagiario, setIsEstagiario] = useState<"sim" | "nao">("nao");

  useEffect(() => {
    if (checking) return;
    if (!isMaster) {
      toast.error("Acesso restrito ao usuário master (diretor / admin@juridico.com).");
      exitToSistema();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, isMaster]);

  useEffect(() => {
    async function loadRoles() {
      setLoadingRoles(true);
      const { data, error } = await supabase
        .from("role_templates" as "agents")
        .select("*")
        .eq("has_login", true)
        .neq("code", "estagiaria_recepcao")
        .order("sort_order", { ascending: true });

      if (error) {
        toast.error("Não foi possível carregar as funções. Aplique a migration V14 no Supabase.");
        setRoles([]);
      } else {
        const rows = (data ?? []) as unknown as RoleTemplateRow[];
        setRoles(rows);
        if (rows.length > 0 && !roleTemplateId) {
          setRoleTemplateId(rows[0].id);
        }
      }
      setLoadingRoles(false);
    }
    void loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !roleTemplateId) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-employee", {
        body: {
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          role_template_id: roleTemplateId,
          is_estagiario: isEstagiario === "sim",
        },
      });

      if (error) {
        throw new Error(await getEdgeFunctionErrorMessage(error, "Erro ao chamar o servidor de convites."));
      }
      if (data?.error) {
        throw new Error(data.message ?? data.error);
      }

      toast.success(data?.message ?? "Funcionário convidado com sucesso!");
      navigate("/sistema");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar convite.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking || loadingRoles) {
    return (
      <HexagonLoader
        variant={embedded ? "inline" : "fullscreen"}
        label="Carregando"
      />
    );
  }

  if (!isMaster) return null;

  return (
    <div
      className={embedded ? "min-h-0 p-6" : "min-h-screen p-6"}
      style={{
        background: embedded ? "transparent" : "#09090f",
        color: "#eeeef5",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div className="max-w-lg mx-auto">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exitToSistema}
            className="btn-voltar px-4 py-2 rounded-lg border border-[#25253a] bg-[#11111a] text-sm text-[#c4c4d4] hover:border-[#eab308]/40"
          >
            ← Voltar
          </button>
          <button
            type="button"
            onClick={goToLista}
            className="px-4 py-2 rounded-lg border border-[#eab308]/50 bg-[#11111a] text-sm text-[#facc15] font-semibold hover:border-[#eab308]"
          >
            Ver Lista
          </button>
        </div>

        <h1 className="text-xl font-bold text-[#eab308] mb-1 m-0">Novo funcionário</h1>
        <p className="text-sm text-[#7a7a92] mb-8 m-0">
          O colaborador receberá um e-mail de JurisAI para definir a senha de acesso.
        </p>

        {roles.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-[#facc15]">
            Nenhuma função disponível. Execute as migrations V14 e V14-master no Supabase.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] text-[#9898b0] uppercase tracking-wider mb-1.5">
                Nome completo do funcionário
              </label>
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex.: Maria Silva Santos"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#9898b0] uppercase tracking-wider mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#9898b0] uppercase tracking-wider mb-1.5">
                Função
              </label>
              <select
                className={inputClass}
                value={roleTemplateId}
                onChange={(e) => setRoleTemplateId(e.target.value)}
                required
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[#9898b0] uppercase tracking-wider mb-1.5">
                É estagiário?
              </label>
              <select
                className={inputClass}
                value={isEstagiario}
                onChange={(e) => setIsEstagiario(e.target.value as "sim" | "nao")}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 rounded-lg border-0 cursor-pointer font-bold text-sm transition-opacity disabled:opacity-60"
                style={{
                  background: "linear-gradient(145deg, #eab308 0%, #facc15 100%)",
                  color: "#0a0a12",
                }}
              >
                {submitting ? "Enviando..." : "Criar"}
              </button>
              <button
                type="button"
                onClick={exitToSistema}
                disabled={submitting}
                className="flex-1 py-3 rounded-lg border border-[#25253a] bg-[#11111a] text-[#eeeef5] text-sm font-semibold cursor-pointer transition-colors hover:bg-red-600 hover:border-red-500 hover:text-white disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
