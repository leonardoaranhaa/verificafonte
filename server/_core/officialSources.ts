/**
 * Conectores de fontes oficiais — dados públicos, sem credencial.
 * Uso: apoio à checagem; o editor confirma e registra evidência.
 */

export type OfficialSeriesPoint = {
  date: string;
  value: string;
};

export type OfficialSeriesResult = {
  provider: "BCB-SGS";
  seriesId: number;
  seriesName: string;
  unit?: string;
  sourceUrl: string;
  points: OfficialSeriesPoint[];
  fetchedAt: string;
  note: string;
};

/** Séries SGS mais usadas em checagens de notícias econômicas no Brasil. */
export const BCB_SGS_CATALOG: Record<
  string,
  { id: number; name: string; unit?: string; keywords: string[] }
> = {
  ipca: {
    id: 433,
    name: "IPCA — variação mensal",
    unit: "% a.m.",
    keywords: ["ipca", "inflação", "inflacao", "preços", "precos"],
  },
  ipca15: {
    id: 189,
    name: "IPCA-15 — variação mensal",
    unit: "% a.m.",
    keywords: ["ipca-15", "ipca15"],
  },
  ipca12m: {
    id: 13522,
    name: "IPCA — acumulado 12 meses",
    unit: "%",
    keywords: ["ipca 12", "acumulado 12", "12 meses"],
  },
  selic: {
    id: 432,
    name: "Taxa Selic — meta definida pelo Copom",
    unit: "% a.a.",
    keywords: ["selic", "copom", "juros"],
  },
  cdi: {
    id: 12,
    name: "Taxa CDI",
    unit: "% a.d.",
    keywords: ["cdi"],
  },
  usd: {
    id: 1,
    name: "Câmbio USD/BRL — compra",
    unit: "R$",
    keywords: ["dólar", "dolar", "usd", "câmbio", "cambio"],
  },
  eur: {
    id: 21619,
    name: "Câmbio EUR/BRL — compra",
    unit: "R$",
    keywords: ["euro", "eur"],
  },
};

function formatBrDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function suggestBcbSeries(claimText: string): Array<{ key: string; id: number; name: string }> {
  const lower = claimText.toLowerCase();
  const hits: Array<{ key: string; id: number; name: string }> = [];
  for (const [key, meta] of Object.entries(BCB_SGS_CATALOG)) {
    if (meta.keywords.some(k => lower.includes(k))) {
      hits.push({ key, id: meta.id, name: meta.name });
    }
  }
  return hits;
}

/**
 * Consulta série temporal do SGS (API pública do BCB).
 * https://api.bcb.gov.br/dados/serie/bcdata.sgs.{id}/dados
 */
export async function fetchBcbSgsSeries(params: {
  seriesId: number;
  /** meses para trás a partir de hoje (default 12) */
  monthsBack?: number;
  lastN?: number;
}): Promise<OfficialSeriesResult> {
  const monthsBack = params.monthsBack ?? 12;
  const end = new Date();
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - monthsBack);

  const catalogEntry = Object.values(BCB_SGS_CATALOG).find(s => s.id === params.seriesId);
  const seriesName = catalogEntry?.name ?? `Série SGS ${params.seriesId}`;

  const url = new URL(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${params.seriesId}/dados`);
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", formatBrDate(start));
  url.searchParams.set("dataFinal", formatBrDate(end));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": "VerificaFonteBot/1.0 (fact-check research)" },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`BCB SGS respondeu HTTP ${response.status}`);
  }

  const data = (await response.json()) as Array<{ data?: string; valor?: string }>;
  if (!Array.isArray(data)) {
    throw new Error("Resposta inesperada da API do BCB");
  }

  let points: OfficialSeriesPoint[] = data
    .filter(row => row && (row.data || row.valor))
    .map(row => ({
      date: String(row.data ?? ""),
      value: String(row.valor ?? ""),
    }));

  if (params.lastN && params.lastN > 0) {
    points = points.slice(-params.lastN);
  }

  return {
    provider: "BCB-SGS",
    seriesId: params.seriesId,
    seriesName,
    unit: catalogEntry?.unit,
    sourceUrl: url.toString(),
    points,
    fetchedAt: new Date().toISOString(),
    note: "Dado oficial do Banco Central (SGS). Confira a série e a data antes de registrar como evidência.",
  };
}
