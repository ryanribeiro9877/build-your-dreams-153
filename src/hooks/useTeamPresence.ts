import { useEffect, useState } from "react";
import { subscribeOnlineUsers } from "@/lib/platformPresenceChannel";

/** Observa quem está online na plataforma (mesmo canal de presença). */
export function useTeamPresence() {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());

  useEffect(() => subscribeOnlineUsers(setOnlineUserIds), []);

  return { onlineUserIds, isOnline: (userId: string) => onlineUserIds.has(userId) };
}
