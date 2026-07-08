// Resolução de CEP → cidade/UF/bairro/logradouro por uma CADEIA de provedores.
// Extraído de index.ts (CADASTRO-CHAT-FIX-4) para ser REUSADO tanto na esteira de
// peças (enrichCepInfo, index.ts) quanto no cadastro pelo chat (tool consultar_cep,
// tools/handlers.ts) — MESMA lógica, sem duplicar. NÃO inventa: sem provedor, a
// localidade fica null (só a UF vem da faixa offline).
//
// O ViaCEP NÃO indexa o "CEP geral" do município (ex.: 43.700-000 de Simões
// Filho/BA → erro); BrasilAPI e OpenCEP agregam outras bases e resolvem esses CEPs
// gerais. Ordem: ViaCEP → BrasilAPI → OpenCEP → faixa offline (garante ao menos a
// UF). Obs.: bairro/logradouro só existem para CEP de RUA; em CEP de município são
// vazios em TODAS as bases.
import { ufFromCep } from "./mechanicalValidator.ts";

export interface CepInfo {
  cep: string;                 // "43.700-000"
  uf: string | null;
  localidade: string | null;   // cidade (via provedor de CEP; null só na faixa offline)
  bairro: string | null;
  logradouro: string | null;
  fonte: "viacep" | "brasilapi" | "opencep" | "faixa";
}

const VIACEP_TIMEOUT_MS = Number(Deno.env.get("VIACEP_TIMEOUT_MS")) || 4000;

export function fmtCep(cep: string): string { return `${cep.slice(0, 2)}.${cep.slice(2, 5)}-${cep.slice(5)}`; }

export async function fetchCepJson(url: string): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VIACEP_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) { console.warn(`[cep] ${url} HTTP ${resp.status}`); return null; }
    return await resp.json() as Record<string, unknown>;
  } catch (e) {
    console.warn(`[cep] ${url} falhou (${e instanceof Error ? e.name : "erro"})`);
    return null;
  } finally { clearTimeout(timer); }
}

function s(v: unknown): string | null { const t = typeof v === "string" ? v.trim() : ""; return t || null; }

export async function resolveCep(cep: string): Promise<CepInfo> {
  const ufFaixa = ufFromCep(parseInt(cep.slice(0, 5), 10));
  const fmt = fmtCep(cep);

  // 1) ViaCEP — cidade + bairro/logradouro (quando CEP de rua).
  const v = await fetchCepJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (v && !v.erro && s(v.uf)) {
    console.log(`[cep] viacep ${cep} -> ${s(v.localidade)}/${s(v.uf)}`);
    return { cep: fmt, uf: s(v.uf), localidade: s(v.localidade), bairro: s(v.bairro), logradouro: s(v.logradouro), fonte: "viacep" };
  }

  // 2) BrasilAPI — agrega provedores; resolve o CEP GERAL de município que o ViaCEP não tem.
  const b = await fetchCepJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (b && s(b.city) && s(b.state)) {
    console.log(`[cep] brasilapi ${cep} -> ${s(b.city)}/${s(b.state)} (${s(b.service) ?? "?"})`);
    return { cep: fmt, uf: s(b.state), localidade: s(b.city), bairro: s(b.neighborhood), logradouro: s(b.street), fonte: "brasilapi" };
  }

  // 3) OpenCEP — base alternativa.
  const o = await fetchCepJson(`https://opencep.com/v1/${cep}`);
  if (o && s(o.localidade) && s(o.uf)) {
    console.log(`[cep] opencep ${cep} -> ${s(o.localidade)}/${s(o.uf)}`);
    return { cep: fmt, uf: s(o.uf), localidade: s(o.localidade), bairro: s(o.bairro), logradouro: s(o.logradouro), fonte: "opencep" };
  }

  // 4) Faixa offline — garante ao menos a UF; cidade → null (nunca inventa).
  console.warn(`[cep] ${cep} não resolvido por provedor -> faixa ${ufFaixa}`);
  return { cep: fmt, uf: ufFaixa, localidade: null, bairro: null, logradouro: null, fonte: "faixa" };
}
