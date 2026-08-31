import type { AssertionCheck, CheckOutcome, OfficialValue, QuantitativeAssertion } from "./types";

/**
 * Comparação determinística entre o número afirmado e o número oficial.
 *
 * É deliberadamente sem modelo de linguagem: dado o mesmo par de números, o
 * resultado é sempre o mesmo e pode ser reproduzido por quem contestar a
 * checagem. É isso que permite publicar o veredito técnico sem revisão humana.
 */

/** Aceita "0,07", "0.07", "1.234,56", "1,234.56", "R$ 1.200", "12%". */
export function parseNumber(raw: string | number): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let text = String(raw).trim();
  if (!text) return null;

  // Remove tudo que não seja dígito, separador ou sinal.
  text = text.replace(/[^\d,.\-+]/g, "");
  if (!text || !/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // O separador decimal é o que aparece por último.
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Vírgula sozinha: decimal no padrão brasileiro, salvo milhar (1,234).
    const decimals = text.length - lastComma - 1;
    text = decimals === 3 && /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Casas decimais explícitas no texto — define a precisão que a alegação assume. */
export function decimalPlaces(raw: string | number): number {
  const text = String(raw);
  const match = text.match(/[.,](\d+)\s*%?\s*$/);
  return match ? match[1].length : 0;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatBr(value: number, places = 2): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: places });
}

export type CompareOptions = {
  /**
   * Precisão assumida pela alegação. Quando o texto diz "0,07", a alegação
   * afirma duas casas — comparar contra 0,0712 exige arredondar o oficial
   * à mesma precisão antes de decidir se diverge.
   */
  claimedDecimals?: number;
  /**
   * Tolerância relativa para "confere_arredondado", como fração.
   * Padrão 0,5% cobre revisão de série e arredondamento de terceiros.
   */
  relativeTolerance?: number;
};

/**
 * Compara um número afirmado com o oficial e devolve o desfecho.
 * Exportada à parte do check completo para ser testável isoladamente.
 */
export function compareValues(
  claimed: number,
  official: number,
  options: CompareOptions = {},
): { outcome: Exclude<CheckOutcome, "nao_verificavel">; difference: number } {
  const { claimedDecimals, relativeTolerance = 0.005 } = options;
  // Arredondar a diferença estabelece o piso de precisão da comparação: abaixo
  // dele o que existe é ruído de ponto flutuante (0.1 + 0.2 = 0.30000000000000004),
  // não discrepância entre a alegação e a fonte.
  const difference = Math.round((claimed - official + Number.EPSILON) * 1e10) / 1e10;

  if (difference === 0) return { outcome: "confere", difference: 0 };

  // A alegação só afirma até a precisão que escreveu.
  if (claimedDecimals != null && round(official, claimedDecimals) === round(claimed, claimedDecimals)) {
    return { outcome: "confere", difference };
  }

  // Zero oficial não admite comparação relativa; qualquer diferença é divergência.
  if (official === 0) return { outcome: "diverge", difference };

  const relative = Math.abs(difference / official);
  if (relative <= relativeTolerance) return { outcome: "confere_arredondado", difference };

  return { outcome: "diverge", difference };
}

/** Monta o resultado completo, com a frase que o editor vai ler. */
export function checkAssertion(
  assertion: QuantitativeAssertion,
  official: OfficialValue | null,
  options: CompareOptions = {},
): AssertionCheck {
  if (!official) {
    return {
      assertion,
      outcome: "nao_verificavel",
      explanation: `Não há fonte oficial no catálogo que responda por "${assertion.indicator}"${assertion.period ? ` em ${assertion.period}` : ""}. A conferência deste ponto continua manual.`,
    };
  }

  const { outcome, difference } = compareValues(assertion.value, official.value, options);
  const unit = official.unit ?? assertion.unit ?? "";
  const suffix = unit ? ` ${unit}` : "";
  const afirmado = `${formatBr(assertion.value, 4)}${suffix}`;
  const oficial = `${formatBr(official.value, 4)}${suffix}`;
  const fonte = `${official.sourceName}, ${official.period}`;

  const explanation =
    outcome === "confere"
      ? `A alegação afirma ${afirmado} e a fonte oficial registra ${oficial} (${fonte}). Os valores conferem.`
      : outcome === "confere_arredondado"
        ? `A alegação afirma ${afirmado} e a fonte oficial registra ${oficial} (${fonte}). A diferença é compatível com arredondamento ou revisão da série — confira antes de tratar como exato.`
        : `A alegação afirma ${afirmado}, mas a fonte oficial registra ${oficial} (${fonte}). Diferença de ${formatBr(Math.abs(difference), 4)}${suffix}.`;

  return { assertion, outcome, official, difference, explanation };
}

/** Resumo do caso: o desfecho mais severo encontrado manda no rótulo geral. */
export function summarizeChecks(checks: AssertionCheck[]) {
  const counts = {
    confere: checks.filter(c => c.outcome === "confere").length,
    confere_arredondado: checks.filter(c => c.outcome === "confere_arredondado").length,
    diverge: checks.filter(c => c.outcome === "diverge").length,
    nao_verificavel: checks.filter(c => c.outcome === "nao_verificavel").length,
  };

  const overall: CheckOutcome | "sem_afirmacoes" =
    checks.length === 0
      ? "sem_afirmacoes"
      : counts.diverge > 0
        ? "diverge"
        : counts.confere + counts.confere_arredondado === 0
          ? "nao_verificavel"
          : counts.confere_arredondado > 0
            ? "confere_arredondado"
            : "confere";

  return { counts, overall, total: checks.length };
}
