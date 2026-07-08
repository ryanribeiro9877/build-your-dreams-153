// src/lib/ibge.ts
//
// CADASTRO-MODELO-A §4 — municípios por UF via IBGE.
// A UF (state / rg_uf / natural_uf) é um <select> fixo das 27 UFs; a Cidade
// (city) e a Naturalidade (natural_city) são <select> DEPENDENTES: ao escolher
// a UF carregamos os municípios daquela UF do serviço do IBGE e cacheamos por UF
// (uma UF só é buscada uma vez por sessão de página).
//
// Fonte: https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios
// Falha de rede/UF vazia → lista vazia (o campo vira texto livre no wizard, sem
// travar o cadastro — honestidade operacional, nunca inventamos municípios).

interface IbgeMunicipio {
  nome: string;
}

// Cache em memória por UF. Guarda a Promise (não só o resultado) para deduplicar
// chamadas concorrentes — dois selects abertos na mesma UF fazem 1 só fetch.
const cache = new Map<string, Promise<string[]>>();

export function fetchMunicipios(uf: string): Promise<string[]> {
  const key = (uf || "").trim().toUpperCase();
  if (!key) return Promise.resolve([]);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios?orderBy=nome`,
      );
      if (!res.ok) throw new Error(`IBGE HTTP ${res.status}`);
      const data = (await res.json()) as IbgeMunicipio[];
      const nomes = (data || [])
        .map((m) => (m?.nome || "").toUpperCase())
        .filter(Boolean);
      // ordena localmente também (o orderBy do IBGE ignora acentuação pt-BR)
      nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
      return nomes;
    } catch {
      // não persiste o erro no cache → uma próxima abertura tenta de novo
      cache.delete(key);
      return [];
    }
  })();
  cache.set(key, p);
  return p;
}
