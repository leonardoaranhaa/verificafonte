import { invokeLLM } from "../llm";
import { checkAssertion, decimalPlaces, parseNumber, summarizeChecks } from "./compare";
import { INDICATOR_CATALOG, sourcesFor, verifiableIndicators } from "./sources";
import type { AssertionCheck, QuantitativeAssertion } from "./types";

export * from "./types";
export { compareValues, parseNumber, decimalPlaces, summarizeChecks } from "./compare";
export { INDICATOR_CATALOG, VERIFIABLE_SOURCES, verifiableIndicators, sourcesFor } from "./sources";

/**
 * O modelo é usado APENAS para ler o texto e apontar o que foi afirmado —
 * indicador, número, período. Ele não julga se a alegação procede: quem decide
 * isso é a comparação aritmética contra a fonte oficial, em compare.ts.
 */
const EXTRACTION_SYSTEM = `Você extrai afirmações quantitativas verificáveis de alegações em português do Brasil.

Para cada número presente no texto que corresponda a um dos indicadores do catálogo, devolva uma entrada com:
- indicator: a chave exata do catálogo
- valueText: o número exatamente como aparece no texto, preservando vírgula e casas decimais
- unit: a unidade citada, se houver
- period: o período referido no formato AAAA-MM para mês, ou AAAA para ano; omita se o texto não disser
- entity: a pessoa ou órgão a que o número se refere, quando o indicador exigir
- excerpt: o trecho literal de onde o número saiu

Regras:
- Só use chaves que existam no catálogo fornecido. Se o número não corresponder a nenhum indicador do catálogo, não o inclua.
- Não converta, não arredonde e não corrija números: copie como está escrito.
- Não infira período que o texto não afirma.
- Se a alegação não contiver nenhuma afirmação quantitativa do catálogo, devolva lista vazia.`;

const EXTRACTION_SCHEMA = {
  name: "quantitative_assertions",
  strict: true,
  schema: {
    type: "object",
    properties: {
      assertions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            indicator: { type: "string" },
            valueText: { type: "string" },
            unit: { type: "string" },
            period: { type: "string" },
            entity: { type: "string" },
            excerpt: { type: "string" },
          },
          required: ["indicator", "valueText", "excerpt"],
          additionalProperties: false,
        },
      },
    },
    required: ["assertions"],
    additionalProperties: false,
  },
};

type RawAssertion = { indicator: string; valueText: string; unit?: string; period?: string; entity?: string; excerpt: string };

/** Descarta o que o modelo devolveu fora do catálogo ou sem número legível. */
export function normalizeAssertions(raw: RawAssertion[]): Array<QuantitativeAssertion & { claimedDecimals: number }> {
  const out: Array<QuantitativeAssertion & { claimedDecimals: number }> = [];
  for (const item of raw) {
    if (!item || !INDICATOR_CATALOG[item.indicator]) continue;
    const value = parseNumber(item.valueText);
    if (value === null) continue;
    const period = item.period?.trim();
    out.push({
      indicator: item.indicator,
      value,
      claimedDecimals: decimalPlaces(item.valueText),
      unit: item.unit?.trim() || INDICATOR_CATALOG[item.indicator].unit,
      period: period && /^\d{4}(-\d{2})?$/.test(period) ? period : undefined,
      entity: item.entity?.trim() || undefined,
      excerpt: item.excerpt.trim().slice(0, 500),
    });
  }
  return out;
}

export async function extractAssertions(claimText: string) {
  const catalog = verifiableIndicators()
    .map(item => `- ${item.key}: ${item.label} (${item.unit})${item.scope === "agente_publico" ? " — exige entity" : ""}. Também dito como: ${item.aliases.join(", ")}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM },
      { role: "user", content: `Catálogo de indicadores:\n${catalog}\n\nAlegação:\n"""\n${claimText}\n"""\n\nExtraia as afirmações quantitativas.` },
    ],
    response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
  });

  const raw = response.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw) as { assertions?: RawAssertion[] };
    return normalizeAssertions(parsed.assertions ?? []);
  } catch {
    throw new Error("O modelo retornou um formato que precisa de revisão técnica.");
  }
}

/**
 * Confere cada afirmação contra as fontes do catálogo. Quando mais de uma
 * fonte responde pelo indicador, todas são consultadas: fontes independentes
 * concordando é evidência mais forte do que uma só, e discordando é um achado
 * que o editor precisa ver.
 */
export async function verifyAssertions(assertions: Array<QuantitativeAssertion & { claimedDecimals: number }>) {
  const checks: AssertionCheck[] = [];
  const corroborations: Array<{ indicator: string; sources: string[]; agree: boolean }> = [];

  for (const assertion of assertions) {
    const sources = sourcesFor(assertion.indicator).filter(source => !source.requiresEntity || assertion.entity);
    if (!sources.length) {
      checks.push(checkAssertion(assertion, null));
      continue;
    }

    const values = await Promise.all(
      sources.map(async source => {
        try {
          return await source.fetchValue({ indicator: assertion.indicator, period: assertion.period, entity: assertion.entity });
        } catch {
          return null;
        }
      }),
    );

    const usable = values.filter((value): value is NonNullable<typeof value> => value !== null);
    if (!usable.length) {
      checks.push(checkAssertion(assertion, null));
      continue;
    }

    // O veredito usa a primeira fonte que respondeu; as demais servem de corroboração.
    checks.push(checkAssertion(assertion, usable[0], { claimedDecimals: assertion.claimedDecimals }));

    if (usable.length > 1) {
      const first = usable[0].value;
      corroborations.push({
        indicator: assertion.indicator,
        sources: usable.map(v => v.sourceName),
        agree: usable.every(v => Math.abs(v.value - first) < 1e-9),
      });
    }
  }

  return { checks, corroborations, summary: summarizeChecks(checks) };
}
