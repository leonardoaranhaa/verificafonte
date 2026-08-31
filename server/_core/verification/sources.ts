import { fetchBcbSgsSeries } from "../officialSources";
import { safeFetch } from "../safeFetch";
import type { OfficialValue, VerifiableSource } from "./types";

/**
 * Catálogo de fontes que respondem por indicadores checáveis.
 *
 * Cada fonte declara quais indicadores atende e como buscar o valor. Somar uma
 * fonte é escrever um adaptador e registrá-lo — o motor de comparação não muda.
 *
 * Todas são APIs públicas, sem credencial. Dados sobre agentes públicos ficam
 * restritos ao exercício do cargo (gastos de gabinete, votos, mandato), que são
 * registro público — não há aqui consulta sobre pessoas privadas.
 */

/** Rótulos legíveis dos indicadores, usados na extração e na interface. */
export const INDICATOR_CATALOG: Record<string, { label: string; unit: string; scope: "macro" | "agente_publico"; aliases: string[] }> = {
  ipca_mensal: { label: "IPCA — variação no mês", unit: "%", scope: "macro", aliases: ["ipca", "inflação no mês", "inflação mensal"] },
  ipca_12m: { label: "IPCA — acumulado em 12 meses", unit: "%", scope: "macro", aliases: ["ipca 12 meses", "inflação em 12 meses", "inflação acumulada"] },
  ipca_ano: { label: "IPCA — acumulado no ano", unit: "%", scope: "macro", aliases: ["ipca no ano", "inflação no ano"] },
  selic_meta: { label: "Taxa Selic — meta do Copom", unit: "% a.a.", scope: "macro", aliases: ["selic", "juros básicos", "taxa básica"] },
  cambio_usd: { label: "Câmbio USD/BRL — compra", unit: "R$", scope: "macro", aliases: ["dólar", "cotação do dólar"] },
  cambio_eur: { label: "Câmbio EUR/BRL — compra", unit: "R$", scope: "macro", aliases: ["euro", "cotação do euro"] },
  desemprego: { label: "Taxa de desocupação (PNAD Contínua)", unit: "%", scope: "macro", aliases: ["desemprego", "taxa de desemprego", "desocupação"] },
  cota_parlamentar_deputado: {
    label: "Cota parlamentar — gasto de deputado no mês",
    unit: "R$",
    scope: "agente_publico",
    aliases: ["cota parlamentar", "verba de gabinete", "gastos do deputado"],
  },
};

function nowIso() {
  return new Date().toISOString();
}

/** "2026-07" -> { year: 2026, month: 7 }; "2026" -> { year: 2026 } */
function parsePeriod(period?: string): { year: number; month?: number } | null {
  if (!period) return null;
  const monthly = period.match(/^(\d{4})-(\d{2})$/);
  if (monthly) return { year: Number(monthly[1]), month: Number(monthly[2]) };
  const yearly = period.match(/^(\d{4})$/);
  if (yearly) return { year: Number(yearly[1]) };
  return null;
}

// ---------------------------------------------------------------------------
// Banco Central — SGS
// ---------------------------------------------------------------------------

const BCB_SERIES: Record<string, number> = {
  ipca_mensal: 433,
  ipca_12m: 13522,
  selic_meta: 432,
  cambio_usd: 1,
  cambio_eur: 21619,
};

export const bcbSource: VerifiableSource = {
  key: "bcb_sgs",
  label: "Banco Central do Brasil (SGS)",
  indicators: Object.keys(BCB_SERIES),
  async fetchValue({ indicator, period }) {
    const seriesId = BCB_SERIES[indicator];
    if (!seriesId) return null;

    // Janela ampla o bastante para conter o período pedido.
    const target = parsePeriod(period);
    const monthsBack = target ? Math.max(12, monthsSince(target) + 2) : 12;
    const series = await fetchBcbSgsSeries({ seriesId, monthsBack });
    if (!series.points.length) return null;

    const point = target
      ? series.points.find(p => matchesBrDate(p.date, target))
      : series.points[series.points.length - 1];
    if (!point) return null;

    const value = Number(String(point.value).replace(",", "."));
    if (!Number.isFinite(value)) return null;

    return {
      value,
      unit: series.unit,
      period: point.date,
      sourceName: "Banco Central do Brasil (SGS)",
      sourceUrl: series.sourceUrl,
      fetchedAt: series.fetchedAt,
    };
  },
};

function monthsSince(target: { year: number; month?: number }) {
  const now = new Date();
  return (now.getUTCFullYear() - target.year) * 12 + (now.getUTCMonth() + 1 - (target.month ?? 12));
}

/** Os pontos do SGS vêm como dd/mm/aaaa. */
function matchesBrDate(date: string, target: { year: number; month?: number }) {
  const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const year = Number(m[3]);
  const month = Number(m[2]);
  return target.month ? year === target.year && month === target.month : year === target.year;
}

// ---------------------------------------------------------------------------
// IBGE — SIDRA
// ---------------------------------------------------------------------------

/** tabela/variável do SIDRA por indicador. */
const SIDRA_QUERIES: Record<string, { table: number; variable: number; label: string }> = {
  ipca_mensal: { table: 1737, variable: 63, label: "IPCA — variação mensal" },
  ipca_12m: { table: 1737, variable: 2265, label: "IPCA — acumulado 12 meses" },
  ipca_ano: { table: 1737, variable: 69, label: "IPCA — acumulado no ano" },
  desemprego: { table: 6381, variable: 4099, label: "Taxa de desocupação" },
};

export const ibgeSource: VerifiableSource = {
  key: "ibge_sidra",
  label: "IBGE (SIDRA)",
  indicators: Object.keys(SIDRA_QUERIES),
  async fetchValue({ indicator, period }) {
    const query = SIDRA_QUERIES[indicator];
    if (!query) return null;

    const target = parsePeriod(period);
    // O SIDRA aceita período no formato aaaamm; sem período, pega o último.
    const periodParam = target?.month ? `${target.year}${String(target.month).padStart(2, "0")}` : "last%201";
    const url = `https://apisidra.ibge.gov.br/values/t/${query.table}/n1/all/v/${query.variable}/p/${periodParam}`;

    const response = await safeFetch(url, { timeoutMs: 15000, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<Record<string, string>>;
    // A primeira linha é o cabeçalho descritivo do SIDRA.
    const data = Array.isArray(rows) ? rows.slice(1) : [];
    const row = data[data.length - 1];
    if (!row) return null;

    const value = Number(String(row.V ?? "").replace(",", "."));
    if (!Number.isFinite(value)) return null;

    return {
      value,
      unit: row.MN === "Percentual" ? "%" : row.MN,
      period: row.D3N ?? period ?? "último disponível",
      sourceName: `IBGE — ${query.label}`,
      sourceUrl: url,
      fetchedAt: nowIso(),
    };
  },
};

// ---------------------------------------------------------------------------
// Câmara dos Deputados — gastos de agentes públicos no exercício do mandato
// ---------------------------------------------------------------------------

export const camaraSource: VerifiableSource = {
  key: "camara_deputados",
  label: "Câmara dos Deputados (dados abertos)",
  indicators: ["cota_parlamentar_deputado"],
  requiresEntity: true,
  async fetchValue({ indicator, period, entity }) {
    if (indicator !== "cota_parlamentar_deputado" || !entity) return null;
    const target = parsePeriod(period);
    if (!target?.month) return null;

    const searchUrl = `https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(entity)}&ordem=ASC&ordenarPor=nome`;
    const found = await safeFetch(searchUrl, { timeoutMs: 15000, headers: { accept: "application/json" } });
    if (!found.ok) return null;
    const list = (await found.json()) as { dados?: Array<{ id: number; nome: string }> };
    const deputy = list.dados?.[0];
    if (!deputy) return null;

    const expensesUrl = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputy.id}/despesas?ano=${target.year}&mes=${target.month}&itens=100`;
    const response = await safeFetch(expensesUrl, { timeoutMs: 15000, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const payload = (await response.json()) as { dados?: Array<{ valorLiquido?: number }> };
    const rows = payload.dados ?? [];
    if (!rows.length) return null;

    const total = rows.reduce((sum, row) => sum + (Number(row.valorLiquido) || 0), 0);
    return {
      value: Math.round(total * 100) / 100,
      unit: "R$",
      period: `${String(target.month).padStart(2, "0")}/${target.year}`,
      sourceName: `Câmara dos Deputados — cota parlamentar de ${deputy.nome}`,
      sourceUrl: expensesUrl,
      fetchedAt: nowIso(),
      note: "Soma dos valores líquidos declarados no mês. Reembolsos lançados depois podem alterar o total.",
    };
  },
};

export const VERIFIABLE_SOURCES: VerifiableSource[] = [bcbSource, ibgeSource, camaraSource];

/** Fontes capazes de responder por um indicador, na ordem de preferência. */
export function sourcesFor(indicator: string): VerifiableSource[] {
  return VERIFIABLE_SOURCES.filter(source => source.indicators.includes(indicator));
}

/** Indicadores que o sistema sabe conferir, para a extração e a interface. */
export function verifiableIndicators() {
  return Object.entries(INDICATOR_CATALOG).map(([key, meta]) => ({
    key,
    ...meta,
    sources: sourcesFor(key).map(source => source.label),
  }));
}
