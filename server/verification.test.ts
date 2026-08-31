import { describe, expect, it } from "vitest";
import { compareValues, decimalPlaces, parseNumber, summarizeChecks } from "./_core/verification/compare";
import { checkAssertion } from "./_core/verification/compare";
import { normalizeAssertions } from "./_core/verification";
import { INDICATOR_CATALOG, sourcesFor, verifiableIndicators } from "./_core/verification/sources";
import type { OfficialValue, QuantitativeAssertion } from "./_core/verification/types";

describe("leitura de números em português", () => {
  it("entende decimal com vírgula", () => {
    expect(parseNumber("0,07")).toBe(0.07);
    expect(parseNumber("4,44")).toBe(4.44);
    expect(parseNumber("15,25")).toBe(15.25);
  });

  it("entende milhar com ponto e decimal com vírgula", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("45.678,90")).toBe(45678.9);
  });

  it("entende o formato inglês quando aparece", () => {
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("0.07")).toBe(0.07);
  });

  it("ignora símbolos de moeda e porcentagem", () => {
    expect(parseNumber("R$ 1.200,50")).toBe(1200.5);
    expect(parseNumber("12%")).toBe(12);
    expect(parseNumber("  -0,5 % ")).toBe(-0.5);
  });

  it("trata milhar sem decimal sem inventar casas", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("12,5")).toBe(12.5);
  });

  it("devolve null para o que não é número", () => {
    expect(parseNumber("muito alto")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("R$")).toBeNull();
  });

  it("conta as casas decimais que a alegação afirma", () => {
    expect(decimalPlaces("0,07")).toBe(2);
    expect(decimalPlaces("4,4")).toBe(1);
    expect(decimalPlaces("12")).toBe(0);
    expect(decimalPlaces("3,25%")).toBe(2);
  });
});

describe("comparação determinística", () => {
  it("confere quando os números são iguais", () => {
    expect(compareValues(0.07, 0.07)).toEqual({ outcome: "confere", difference: 0 });
  });

  it("confere quando a diferença está abaixo da precisão que a alegação afirma", () => {
    // "0,07" afirma duas casas; 0,0712 arredondado a duas casas é 0,07.
    expect(compareValues(0.07, 0.0712, { claimedDecimals: 2 }).outcome).toBe("confere");
  });

  it("não usa a precisão da alegação para encobrir divergência real", () => {
    // 0,12 arredondado a duas casas continua 0,12 — diferente de 0,07.
    expect(compareValues(0.07, 0.12, { claimedDecimals: 2 }).outcome).toBe("diverge");
  });

  it("marca como arredondado o que cabe na tolerância relativa", () => {
    // 0,2% de diferença: compatível com revisão de série.
    expect(compareValues(100, 100.2).outcome).toBe("confere_arredondado");
  });

  it("diverge quando passa da tolerância", () => {
    const result = compareValues(100, 130);
    expect(result.outcome).toBe("diverge");
    expect(result.difference).toBe(-30);
  });

  it("não admite comparação relativa contra zero", () => {
    expect(compareValues(0.5, 0).outcome).toBe("diverge");
    expect(compareValues(0, 0).outcome).toBe("confere");
  });

  it("é simétrica no sinal da diferença", () => {
    expect(compareValues(120, 100).difference).toBe(20);
    expect(compareValues(80, 100).difference).toBe(-20);
  });

  it("não acumula erro de ponto flutuante", () => {
    expect(compareValues(0.3, 0.1 + 0.2).outcome).toBe("confere");
  });
});

describe("veredito legível", () => {
  const assertion: QuantitativeAssertion = { indicator: "ipca_mensal", value: 0.07, unit: "%", period: "2026-07", excerpt: "o IPCA subiu 0,07% em julho" };
  const official: OfficialValue = { value: 0.07, unit: "%", period: "01/07/2026", sourceName: "Banco Central do Brasil (SGS)", sourceUrl: "https://api.bcb.gov.br/x", fetchedAt: new Date().toISOString() };

  it("diz que confere, citando os dois números e a fonte", () => {
    const check = checkAssertion(assertion, official);
    expect(check.outcome).toBe("confere");
    expect(check.explanation).toContain("0,07");
    expect(check.explanation).toContain("Banco Central");
    expect(check.explanation).toContain("conferem");
  });

  it("aponta a divergência com o tamanho da diferença", () => {
    const check = checkAssertion(assertion, { ...official, value: 0.5 });
    expect(check.outcome).toBe("diverge");
    expect(check.explanation).toContain("Diferença");
    expect(check.difference).toBeCloseTo(-0.43, 10);
  });

  it("admite que não sabe quando não há fonte", () => {
    const check = checkAssertion(assertion, null);
    expect(check.outcome).toBe("nao_verificavel");
    expect(check.explanation).toContain("continua manual");
  });

  it("avisa para conferir quando o resultado é apenas aproximado", () => {
    const check = checkAssertion({ ...assertion, value: 100 }, { ...official, value: 100.2 });
    expect(check.outcome).toBe("confere_arredondado");
    expect(check.explanation).toContain("arredondamento");
  });
});

describe("resumo do caso", () => {
  const base: QuantitativeAssertion = { indicator: "ipca_mensal", value: 1, excerpt: "x" };
  const official = (value: number): OfficialValue => ({ value, period: "p", sourceName: "s", sourceUrl: "u", fetchedAt: "t" });

  it("uma divergência domina o resultado geral", () => {
    const checks = [checkAssertion(base, official(1)), checkAssertion(base, official(50))];
    expect(summarizeChecks(checks).overall).toBe("diverge");
  });

  it("tudo conferindo devolve confere", () => {
    const checks = [checkAssertion(base, official(1)), checkAssertion(base, official(1))];
    expect(summarizeChecks(checks).overall).toBe("confere");
  });

  it("um aproximado rebaixa o conjunto", () => {
    const checks = [checkAssertion(base, official(1)), checkAssertion({ ...base, value: 100 }, official(100.2))];
    expect(summarizeChecks(checks).overall).toBe("confere_arredondado");
  });

  it("sem afirmações quantitativas o caso não é rebaixado nem promovido", () => {
    expect(summarizeChecks([]).overall).toBe("sem_afirmacoes");
  });

  it("só não-verificáveis não vira confirmação", () => {
    expect(summarizeChecks([checkAssertion(base, null)]).overall).toBe("nao_verificavel");
  });
});

describe("normalização do que o modelo devolve", () => {
  it("descarta indicador fora do catálogo", () => {
    const out = normalizeAssertions([{ indicator: "inventado_pelo_modelo", valueText: "10", excerpt: "x" }]);
    expect(out).toEqual([]);
  });

  it("descarta valor que não é número", () => {
    expect(normalizeAssertions([{ indicator: "ipca_mensal", valueText: "bastante", excerpt: "x" }])).toEqual([]);
  });

  it("preserva a precisão escrita no texto", () => {
    const [out] = normalizeAssertions([{ indicator: "ipca_mensal", valueText: "0,07", excerpt: "IPCA de 0,07%" }]);
    expect(out.value).toBe(0.07);
    expect(out.claimedDecimals).toBe(2);
  });

  it("ignora período em formato que não reconhece", () => {
    const [out] = normalizeAssertions([{ indicator: "ipca_mensal", valueText: "1", period: "julho passado", excerpt: "x" }]);
    expect(out.period).toBeUndefined();
  });

  it("aceita mês e ano no formato ISO parcial", () => {
    const [mes] = normalizeAssertions([{ indicator: "ipca_mensal", valueText: "1", period: "2026-07", excerpt: "x" }]);
    const [ano] = normalizeAssertions([{ indicator: "ipca_ano", valueText: "1", period: "2026", excerpt: "x" }]);
    expect(mes.period).toBe("2026-07");
    expect(ano.period).toBe("2026");
  });
});

describe("catálogo de fontes", () => {
  it("todo indicador do catálogo tem ao menos uma fonte", () => {
    for (const key of Object.keys(INDICATOR_CATALOG)) {
      expect(sourcesFor(key).length, key).toBeGreaterThan(0);
    }
  });

  it("IPCA é coberto por duas fontes independentes", () => {
    const nomes = sourcesFor("ipca_mensal").map(s => s.key);
    expect(nomes).toContain("bcb_sgs");
    expect(nomes).toContain("ibge_sidra");
  });

  it("indicador sobre agente público exige identificar a pessoa", () => {
    const [fonte] = sourcesFor("cota_parlamentar_deputado");
    expect(fonte.requiresEntity).toBe(true);
    expect(INDICATOR_CATALOG.cota_parlamentar_deputado.scope).toBe("agente_publico");
  });

  it("expõe o catálogo com as fontes que respondem por cada indicador", () => {
    const ipca = verifiableIndicators().find(i => i.key === "ipca_mensal");
    expect(ipca?.sources.length).toBe(2);
  });
});
