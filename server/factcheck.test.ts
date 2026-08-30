import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { assertPublishable, canonicalizeUrl, claimInputSchema, crossCheckOfficialInputSchema, evidenceInputSchema, historicalSearchInputSchema, OFFICIAL_SEARCH_SITES, parseHistoricalRss, researchTaskInputSchema, reviewInputSchema, sourceConnectionInputSchema } from "./routers";
import type { TrpcContext } from "./_core/context";

const publicContext: TrpcContext = {
  user: null,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("fact-check public contract", () => {
  it("returns an empty public bundle for a slug that is not published", async () => {
    const caller = appRouter.createCaller(publicContext);
    const result = await caller.cases.publicBySlug({ slug: "caso-que-nao-existe" });

    expect(result.caseRecord).toBeUndefined();
    expect(result.evidenceRows).toEqual([]);
    expect(result.reviewRows).toEqual([]);
    expect(result.analysisRows).toEqual([]);
  });

  it("validates the minimum contracts for claim, evidence and review intake", () => {
    expect(claimInputSchema.safeParse({ claimText: "curta" }).success).toBe(false);
    expect(claimInputSchema.safeParse({ claimText: "Uma alegação suficientemente clara", claimUrl: "https://example.com" }).success).toBe(true);
    expect(evidenceInputSchema.safeParse({ caseId: 1, title: "Fonte", url: "não é url", sourceName: "Origem", sourceType: "oficial", context: "Contexto suficientemente descrito", relation: "apoia" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ caseId: 1, decision: "aprovar", note: "A revisão conferiu as fontes principais." }).success).toBe(true);
  });

  it("validates authorized source and agent task contracts", () => {
    expect(sourceConnectionInputSchema.safeParse({ name: "Fonte pública", endpoint: "https://example.com/feed", sourceType: "oficial", accessMode: "publico" }).success).toBe(true);
    expect(sourceConnectionInputSchema.safeParse({ name: "Fonte privada", endpoint: "http://localhost:3000", sourceType: "oficial", accessMode: "credencial" }).success).toBe(true);
    expect(researchTaskInputSchema.safeParse({ caseId: 1, objective: "Encontrar a publicação primária que sustenta a alegação", workerRole: "navegador" }).success).toBe(true);
    expect(researchTaskInputSchema.safeParse({ caseId: 1, objective: "curto", workerRole: "navegador" }).success).toBe(false);
  });

  it("blocks publication without human approval and public explanation", () => {
    expect(() => assertPublishable({ workflowStatus: "publicado", methodology: "", editorialNote: "" }, true)).toThrow("metodologia");
    expect(() => assertPublishable({ workflowStatus: "publicado", methodology: "Método descrito", editorialNote: "Justificativa descrita" }, false)).toThrow("revisão humana");
    expect(() => assertPublishable({ workflowStatus: "publicado", methodology: "Método descrito", editorialNote: "Justificativa descrita" }, true)).not.toThrow();
  });

  it("exposes only the transparent status vocabulary", () => {
    const statuses = ["em_apuracao", "confirmado", "divergente", "insuficiente"];
    expect(statuses).toContain("em_apuracao");
    expect(statuses).toContain("insuficiente");
    expect(statuses).not.toContain("falso");
    expect(statuses).not.toContain("verdadeiro");
  });

  it("validates historical search windows and normalizes tracking URLs", () => {
    expect(historicalSearchInputSchema.safeParse({ caseId: 1, query: "IPCA julho", startDate: "2026-08-01", endDate: "2026-08-29" }).success).toBe(true);
    expect(historicalSearchInputSchema.safeParse({ caseId: 1, query: "IPCA", startDate: "29/08/2026", endDate: "2026-08-29" }).success).toBe(false);
    expect(canonicalizeUrl("https://example.com/noticia?utm_source=g1&ref=home#trecho")).toBe("https://example.com/noticia?ref=home");
  });

  it("parses historical candidates with explicit provenance and deduplicates RSS items", () => {
    const rss = `<rss><channel><item><title>IPCA e preços</title><link>https://news.google.com/rss/articles/a?utm_source=x</link><pubDate>Wed, 26 Aug 2026 12:06:42 GMT</pubDate><source url="https://valor.globo.com">Valor Econômico</source></item><item><title>IPCA e preços</title><link>https://news.google.com/rss/articles/a?utm_source=x</link><pubDate>Wed, 26 Aug 2026 12:06:42 GMT</pubDate><source>Valor Econômico</source></item></channel></rss>`;
    const results = parseHistoricalRss(rss, 10, [], "por", "2026-08-29T10:00:00.000Z");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ title: "IPCA e preços", publisher: "Valor Econômico", discoverySource: "Google Notícias RSS", needsEditorialOpen: true, accessedAt: "2026-08-29T10:00:00.000Z" });
    expect(results[0]?.discoveryUrl).toContain("news.google.com");
  });

  it("cross-checks against a curated list of official .gov.br/.jus.br/.leg.br sources", () => {
    expect(OFFICIAL_SEARCH_SITES).toContain("gov.br");
    expect(OFFICIAL_SEARCH_SITES).toContain("ibge.gov.br");
    expect(OFFICIAL_SEARCH_SITES.every(site => /(^|\.)(gov\.br|jus\.br|leg\.br|ebc\.com\.br)$/.test(site))).toBe(true);
    expect(crossCheckOfficialInputSchema.safeParse({ caseId: 1 }).success).toBe(true);
    expect(crossCheckOfficialInputSchema.safeParse({ caseId: 1, query: "IPCA julho" }).success).toBe(true);
    expect(crossCheckOfficialInputSchema.safeParse({ caseId: 0 }).success).toBe(false);
  });
});
