import { useState, useEffect, useCallback, type ComponentType } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  type ClientFull, CLIENT_FULL_COLUMNS, ALLOWED_ROLES, RestrictedAccess,
  statusBadgeStyle, ghostButtonStyle, goldButtonStyle, pageStyle,
} from "@/components/clients/shared";
import {
  ResumoTab, DadosPessoaisTab, GovBrTab, ContatosTab, EnderecoTab, ObservacoesTab,
} from "@/components/clients/tabs/infoTabs";
import {
  DocumentosTab, TarefasTab, PendenciasTab, ProcessosTab,
} from "@/components/clients/tabs/relationalTabs";
import { PecasTab, HistoricoTab, AudiosTab } from "@/components/clients/tabs/chatTabs";
import { EmptyState } from "@/components/clients/shared";

// Empty-states honestos — abas sem fonte de dado própria hoje (§3).
const ReunioesTab = () => <EmptyState title="Nenhuma reunião registrada" hint="Ainda não há uma fonte de reuniões vinculada ao cliente." />;
const AudienciasTab = () => <EmptyState title="Nenhuma audiência registrada" hint="Ainda não há uma fonte de audiências vinculada ao cliente." />;
const ProtocolosTab = () => <EmptyState title="Nenhum protocolo registrado" hint="Ainda não há uma fonte de protocolos vinculada ao cliente." />;

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

  return (
    <div style={{ ...pageStyle, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn-voltar" onClick={() => navigate("/clientes")} style={ghostButtonStyle}>← Clientes</button>
        <h1 style={{ fontFamily: "'Roboto', sans-serif", fontSize: 24, fontWeight: 600, color: "var(--gold, #c9a84c)", margin: 0 }}>
          {client.full_name}
        </h1>
        <span style={statusBadgeStyle(client.status)}>{client.status}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate(`/clientes/${client.id}/editar`)} style={goldButtonStyle}>Editar</button>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap",
        borderBottom: "1px solid var(--border)", paddingBottom: 12,
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)} style={{
            padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            background: activeKey === t.key ? "linear-gradient(135deg, #c9a84c, #e8c96a)" : "var(--bg2)",
            color: activeKey === t.key ? "#0a0a12" : "var(--text2)",
            transition: "all 0.2s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Active tab content (lazy) */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, minHeight: 240,
      }}>
        <ActiveComp key={activeKey} client={client} />
      </div>
    </div>
  );
}
