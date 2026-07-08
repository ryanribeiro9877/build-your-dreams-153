import { useState, useEffect, useCallback, type ComponentType } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  type ClientFull, CLIENT_FULL_COLUMNS, ALLOWED_ROLES, RestrictedAccess,
  StatusBadge, EmptyState,
} from "@/components/clients/shared";
import {
  ResumoTab, DadosPessoaisTab, GovBrTab, ContatosTab, EnderecoTab, ObservacoesTab,
} from "@/components/clients/tabs/infoTabs";
import {
  DocumentosTab, TarefasTab, PendenciasTab, ProcessosTab,
} from "@/components/clients/tabs/relationalTabs";
import { PecasTab, AudiosTab } from "@/components/clients/tabs/chatTabs";
import { HistoricoTab } from "@/components/clients/tabs/historicoTab";

// Empty-states honestos — abas sem fonte de dado própria hoje (§3).
const ReunioesTab = () => <EmptyState icon="👥" title="Nenhuma reunião registrada" hint="Quando houver uma fonte de reuniões no sistema, elas aparecem aqui." />;
const AudienciasTab = () => <EmptyState icon="⚖" title="Nenhuma audiência registrada" hint="Quando houver uma fonte de audiências no sistema, elas aparecem aqui." />;
const ProtocolosTab = () => <EmptyState icon="🗎" title="Nenhum protocolo registrado" hint="Quando houver uma fonte de protocolos no sistema, eles aparecem aqui." />;

// Shell das 16 abas, na ordem do card. Cada aba renderiza sob demanda
// (só a ativa é montada → carga lazy do seu conteúdo).
const TABS: { key: string; label: string; Comp: ComponentType<{ client: ClientFull }> }[] = [
  { key: "resumo", label: "Resumo", Comp: ResumoTab },
  { key: "dados", label: "Dados pessoais", Comp: DadosPessoaisTab },
  { key: "govbr", label: "Gov.br", Comp: GovBrTab },
  { key: "contatos", label: "Contatos", Comp: ContatosTab },
  { key: "endereco", label: "Endereço", Comp: EnderecoTab },
  { key: "documentos", label: "Documentos", Comp: DocumentosTab },
  { key: "pendencias", label: "Pendências", Comp: PendenciasTab },
  { key: "tarefas", label: "Tarefas", Comp: TarefasTab },
  { key: "reunioes", label: "Reuniões", Comp: ReunioesTab },
  { key: "audiencias", label: "Audiências", Comp: AudienciasTab },
  { key: "processos", label: "Processos/Ações", Comp: ProcessosTab },
  { key: "pecas", label: "Peças", Comp: PecasTab },
  { key: "protocolos", label: "Protocolos", Comp: ProtocolosTab },
  { key: "historico", label: "Histórico", Comp: HistoricoTab },
  { key: "audios", label: "Áudios/Transcrições", Comp: AudiosTab },
  { key: "observacoes", label: "Observações", Comp: ObservacoesTab },
];

export default function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasAccess = ALLOWED_ROLES.includes(workspace?.role_template?.code ?? "");

  const [client, setClient] = useState<ClientFull | null>(null);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab");
  const activeKey = TABS.some(t => t.key === tabParam) ? tabParam! : "resumo";
  const setActive = (key: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set("tab", key);
    return next;
  }, { replace: true });

  const load = useCallback(async (clientId: string) => {
    setLoading(true);
    // R-2 Fase 2B: leitura pela view decifrada (CPF/RG/financeiro/filiação
    // via RLS is_recepcao_or_socio), projeção explícita — nunca select("*").
    // (cast: a view não está nos tipos gerados do supabase.)
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: ClientFull | null; error: unknown }> } };
      };
    }).from("clients_decrypted").select(CLIENT_FULL_COLUMNS).eq("id", clientId).single();
    if (error || !data) { toast.error("Cliente não encontrado"); navigate("/clientes"); return; }
    setClient(data);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { if (id) void load(id); }, [id, load]);

  if (workspace && !hasAccess) return <RestrictedAccess />;
  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando detalhes..." />;
  if (!client) return null;

  const ActiveComp = (TABS.find(t => t.key === activeKey) ?? TABS[0]).Comp;
  const isPJ = client.tipo_pessoa === "juridica";

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        {/* top bar */}
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/clientes")}>← Clientes</button>
          <span className="cli-title">{client.full_name}</span>
          <StatusBadge status={client.status} />
          <span className="cli-pf">{isPJ ? "Pessoa jurídica" : "Pessoa física"}</span>
          <span className="cli-spacer" />
          <button className="cli-btn" onClick={() => navigate(`/clientes/${client.id}/editar`)}>✎ Editar</button>
        </div>

        {/* tabs */}
        <div className="cli-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`cli-tab${activeKey === t.key ? " active" : ""}`}
              role="tab"
              aria-selected={activeKey === t.key}
              onClick={() => setActive(t.key)}
            >{t.label}</button>
          ))}
        </div>

        {/* active tab content (lazy) */}
        <div className="cli-panel" key={activeKey}>
          <ActiveComp client={client} />
        </div>
      </div>
    </div>
  );
}
