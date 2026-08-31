/**
 * Verificação automática de afirmações quantitativas.
 *
 * A ideia central: parte de uma alegação é conferível por máquina. "O IPCA
 * subiu 0,07% em julho" contém um número, um indicador e um período — a série
 * oficial devolve um número para o mesmo indicador e período, e a comparação é
 * aritmética, não editorial.
 *
 * O que este módulo produz é um veredito TÉCNICO sobre uma afirmação isolada
 * ("o número confere com a fonte oficial"), nunca o status editorial do caso.
 * A decisão de publicar continua humana — ver assertPublishable em routers.ts.
 */

/** Uma afirmação quantitativa extraída do texto da alegação. */
export type QuantitativeAssertion = {
  /** Chave do indicador no catálogo (ex.: "ipca_mensal"). */
  indicator: string;
  /** Valor afirmado, já normalizado para número (0,07 -> 0.07). */
  value: number;
  /** Unidade declarada na alegação, quando houver. */
  unit?: string;
  /** Período referido, em ISO parcial: "2026-07" (mês) ou "2026" (ano). */
  period?: string;
  /** Entidade a que a afirmação se refere, para indicadores por pessoa/órgão. */
  entity?: string;
  /** Trecho literal de onde veio, para o editor conferir a leitura. */
  excerpt: string;
};

/** Valor devolvido por uma fonte oficial, com procedência. */
export type OfficialValue = {
  value: number;
  unit?: string;
  /** Período efetivamente retornado, que pode diferir do pedido. */
  period: string;
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  /** Observação da fonte, ex.: dado preliminar sujeito a revisão. */
  note?: string;
};

export type CheckOutcome =
  /** O número da alegação bate com a fonte oficial. */
  | "confere"
  /** Diferença compatível com arredondamento do próprio texto. */
  | "confere_arredondado"
  /** Diferença real entre a alegação e o dado oficial. */
  | "diverge"
  /** Não há fonte para este indicador/período, ou a fonte não respondeu. */
  | "nao_verificavel";

export type AssertionCheck = {
  assertion: QuantitativeAssertion;
  outcome: CheckOutcome;
  official?: OfficialValue;
  /** Diferença absoluta entre afirmado e oficial, quando ambos existem. */
  difference?: number;
  /** Frase pronta para o editor ler, explicando o resultado. */
  explanation: string;
};

/**
 * Fonte capaz de responder por um indicador.
 * Manter esta interface estreita é o que torna barato somar novas fontes.
 */
export type VerifiableSource = {
  key: string;
  label: string;
  /** Indicadores que esta fonte sabe responder. */
  indicators: string[];
  /** Se o indicador exige uma entidade (pessoa, órgão) para ser consultado. */
  requiresEntity?: boolean;
  fetchValue(params: { indicator: string; period?: string; entity?: string }): Promise<OfficialValue | null>;
};
