import { usePlatformPresence } from "@/hooks/usePlatformPresence";

/** Montado em rotas autenticadas para publicar presença em tempo real. */
export function PlatformPresenceSync() {
  usePlatformPresence();
  return null;
}
