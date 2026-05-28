import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const PLATFORM_PRESENCE_CHANNEL = "jurisai-platform-presence";

type OnlineListener = (ids: Set<string>) => void;

let channel: RealtimeChannel | null = null;
let presenceKey: string | null = null;
const onlineListeners = new Set<OnlineListener>();
let trackInterval: ReturnType<typeof setInterval> | null = null;

function collectOnlineUserIds(state: Record<string, unknown[]>): Set<string> {
  const ids = new Set<string>();
  for (const presences of Object.values(state)) {
    if (!Array.isArray(presences)) continue;
    for (const p of presences) {
      const row = p as { user_id?: string };
      if (row.user_id) ids.add(row.user_id);
    }
  }
  return ids;
}

function broadcastOnline() {
  if (!channel) return;
  const ids = collectOnlineUserIds(channel.presenceState());
  onlineListeners.forEach((fn) => fn(ids));
}

/** Canal único: handlers de presence sempre antes do subscribe. */
function ensureChannel(trackKey: string | null) {
  if (channel) {
    if (!trackKey || presenceKey === trackKey) return channel;
    if (trackInterval) {
      clearInterval(trackInterval);
      trackInterval = null;
    }
    void supabase.removeChannel(channel);
    channel = null;
  }

  presenceKey = trackKey;
  channel = supabase.channel(PLATFORM_PRESENCE_CHANNEL, {
    config: trackKey ? { presence: { key: trackKey } } : undefined,
  });

  channel
    .on("presence", { event: "sync" }, broadcastOnline)
    .on("presence", { event: "join" }, broadcastOnline)
    .on("presence", { event: "leave" }, broadcastOnline)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        if (trackKey) {
          await channel?.track({
            user_id: trackKey,
            at: new Date().toISOString(),
          });
        }
        broadcastOnline();
      }
    });

  return channel;
}

export function startPlatformPresence(userId: string) {
  ensureChannel(userId);

  if (trackInterval) clearInterval(trackInterval);
  trackInterval = setInterval(() => {
    void channel?.track({
      user_id: userId,
      at: new Date().toISOString(),
    });
  }, 30_000);
}

export function stopPlatformPresence() {
  if (trackInterval) {
    clearInterval(trackInterval);
    trackInterval = null;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
    presenceKey = null;
  }
}

/** Observa IDs online (ex.: lista de funcionários). */
export function subscribeOnlineUsers(listener: OnlineListener): () => void {
  if (!channel) ensureChannel(null);

  onlineListeners.add(listener);
  if (channel) {
    listener(collectOnlineUserIds(channel.presenceState()));
  }

  return () => {
    onlineListeners.delete(listener);
  };
}
