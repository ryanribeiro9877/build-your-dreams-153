import { supabase } from "@/integrations/supabase/client";

export interface BusinessHours {
  timezone: string;
  workdays: number[];              // ISO: 1=seg ... 7=dom
  open_time: string;               // "HH:MM"
  close_time: string;              // "HH:MM"
  windows: [string, string][];     // [["08:00","11:00"],["13:00","16:00"]]
  holidays: string[];              // ["YYYY-MM-DD"]
}

// Default do Rodrigo. NB: este util trabalha no fuso local do navegador
// (escritório único, America/Bahia). Não faz conversão de timezone nesta fase.
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "America/Bahia",
  workdays: [1, 2, 3, 4, 5],
  open_time: "08:00",
  close_time: "17:00",
  windows: [["08:00", "11:00"], ["13:00", "16:00"]],
  holidays: [],
};

function isoDow(d: Date): number { const g = d.getDay(); return g === 0 ? 7 : g; } // 1..7
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function minutes(hhmm: string): number { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }

function isWorkday(d: Date, cfg: BusinessHours): boolean {
  return cfg.workdays.includes(isoDow(d)) && !cfg.holidays.includes(ymd(d));
}

export function isWithinBusinessHours(d: Date, cfg: BusinessHours = DEFAULT_BUSINESS_HOURS): boolean {
  if (!isWorkday(d, cfg)) return false;
  const cur = d.getHours() * 60 + d.getMinutes();
  return cfg.windows.some(([a, b]) => cur >= minutes(a) && cur < minutes(b));
}

/** Próximo horário útil >= d (início da próxima janela válida). */
export function nextBusinessSlot(d: Date, cfg: BusinessHours = DEFAULT_BUSINESS_HOURS): Date {
  const probe = new Date(d.getTime());
  for (let i = 0; i < 366; i++) {
    if (isWorkday(probe, cfg)) {
      const cur = probe.getHours() * 60 + probe.getMinutes();
      for (const [a, b] of cfg.windows) {
        const start = minutes(a), end = minutes(b);
        if (cur < start) { const r = new Date(probe); r.setHours(Math.floor(start / 60), start % 60, 0, 0); return r; }
        if (cur >= start && cur < end) return new Date(probe); // já dentro
      }
    }
    // vai para o próximo dia às 00:00 e tenta de novo
    probe.setDate(probe.getDate() + 1);
    probe.setHours(0, 0, 0, 0);
  }
  return new Date(d.getTime());
}

export async function loadBusinessHours(): Promise<BusinessHours> {
  try {
    const { data, error } = await supabase.rpc("get_business_hours");
    if (error || !data) return DEFAULT_BUSINESS_HOURS;
    const j = data as Record<string, unknown>;
    return {
      timezone: String(j.timezone ?? DEFAULT_BUSINESS_HOURS.timezone),
      workdays: (j.workdays as number[]) ?? DEFAULT_BUSINESS_HOURS.workdays,
      open_time: String(j.open_time ?? "08:00").slice(0, 5),
      close_time: String(j.close_time ?? "17:00").slice(0, 5),
      windows: (j.windows as [string, string][]) ?? DEFAULT_BUSINESS_HOURS.windows,
      holidays: ((j.holidays as string[]) ?? []).map((s) => String(s).slice(0, 10)),
    };
  } catch { return DEFAULT_BUSINESS_HOURS; }
}
