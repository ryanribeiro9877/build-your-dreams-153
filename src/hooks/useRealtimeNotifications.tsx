import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const initialized = useRef(false);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;

    const clientsChannel = supabase
      .channel("notify_clients")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clients" }, (payload) => {
        const client = payload.new as { full_name: string };
        toast.info(`👤 Novo cliente cadastrado: ${client.full_name}`, { duration: 5000 });
      })
      .subscribe();

    const docsChannel = supabase
      .channel("notify_documents")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_documents" }, (payload) => {
        const doc = payload.new as { document_name: string; document_type: string };
        toast.info(`📎 Novo documento: ${doc.document_name} (${doc.document_type})`, { duration: 5000 });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(docsChannel);
    };
  }, [user]);
}
