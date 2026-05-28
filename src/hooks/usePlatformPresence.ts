import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  PLATFORM_PRESENCE_CHANNEL,
  startPlatformPresence,
  stopPlatformPresence,
} from "@/lib/platformPresenceChannel";

export { PLATFORM_PRESENCE_CHANNEL };

/** Publica presença do usuário logado (heartbeat ~30s) para o painel admin. */
export function usePlatformPresence() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    startPlatformPresence(user.id);

    return () => {
      stopPlatformPresence();
    };
  }, [user?.id]);
}
