import { describe, expect, it } from "vitest";
import { formatTimecode, momentDeepLink, safeParseDate, sourceMomentInputSchema } from "./routers";
import { suggestBcbSeries, BCB_SGS_CATALOG } from "./_core/officialSources";
import { ratingToRelation } from "./_core/googleFactCheck";

describe("momentos: prova original × versão viral", () => {
  it("exige a descrição da distorção só na versão viral", () => {
    const base = { caseId: 1, title: "Entrevista completa", url: "https://example.com/v", sourceName: "Canal" };

    // O schema aceita ambos; a regra de negócio vive no router (moments.register).
    expect(sourceMomentInputSchema.safeParse({ ...base, role: "original" }).success).toBe(true);
    expect(sourceMomentInputSchema.safeParse({ ...base, role: "viral_distorcido", distortionDescription: "Corte omitiu a pergunta" }).success).toBe(true);
  });

  it("aplica padrões editoriais: papel original, mídia vídeo e espelho em evidência", () => {
    const parsed = sourceMomentInputSchema.parse({ caseId: 1, title: "Fala na comissão", url: "https://example.com/v", sourceName: "TV Câmara" });
    expect(parsed.role).toBe("original");
    expect(parsed.mediaKind).toBe("video");
    expect(parsed.mirrorAsEvidence).toBe(true);
  });

  it("rejeita URL inválida e timestamp fora da faixa de um dia", () => {
    const base = { caseId: 1, title: "Fala na comissão", sourceName: "TV Câmara" };
    expect(sourceMomentInputSchema.safeParse({ ...base, url: "não é url" }).success).toBe(false);
    expect(sourceMomentInputSchema.safeParse({ ...base, url: "https://example.com/v", timestampStartSec: 90000 }).success).toBe(false);
    expect(sourceMomentInputSchema.safeParse({ ...base, url: "https://example.com/v", timestampStartSec: 754 }).success).toBe(true);
  });

  it("formata o instante da fala de forma legível", () => {
    expect(formatTimecode(45)).toBe("45s");
    expect(formatTimecode(754)).toBe("12m34s");
    expect(formatTimecode(3754)).toBe("1h02m34s");
  });

  it("aponta o link direto para o instante em vídeos do YouTube", () => {
    expect(momentDeepLink("https://www.youtube.com/watch?v=abc12345678", 754)).toContain("t=754s");
    expect(momentDeepLink("https://youtu.be/abc12345678", 30)).toContain("t=30s");
    // Em outras mídias a URL é preservada como veio.
    expect(momentDeepLink("https://example.com/materia", 754)).toBe("https://example.com/materia");
    expect(momentDeepLink("https://www.youtube.com/watch?v=abc12345678")).not.toContain("t=");
  });

  it("aceita datas ISO e brasileiras, e descarta o que não é data", () => {
    expect(safeParseDate("2026-08-30")?.toISOString().slice(0, 10)).toBe("2026-08-30");
    expect(safeParseDate("30/08/2026")?.toISOString().slice(0, 10)).toBe("2026-08-30");
    expect(safeParseDate("qualquer coisa")).toBeUndefined();
    expect(safeParseDate(undefined)).toBeUndefined();
  });
});

describe("fontes oficiais e checagens publicadas", () => {
  it("sugere a série do BCB a partir do indicador citado na alegação", () => {
    expect(suggestBcbSeries("O IPCA subiu 0,07% em julho").some(hit => hit.id === BCB_SGS_CATALOG.ipca.id)).toBe(true);
    expect(suggestBcbSeries("O Copom manteve a Selic").some(hit => hit.id === BCB_SGS_CATALOG.selic.id)).toBe(true);
    expect(suggestBcbSeries("O dólar fechou em alta").some(hit => hit.id === BCB_SGS_CATALOG.usd.id)).toBe(true);
    expect(suggestBcbSeries("Uma alegação sobre trânsito urbano")).toEqual([]);
  });

  it("traduz o rótulo do veículo em relação editorial, sem virar veredito", () => {
    expect(ratingToRelation("Falso")).toBe("contradiz");
    expect(ratingToRelation("Enganoso")).toBe("contradiz");
    expect(ratingToRelation("Distorcido")).toBe("contradiz");
    expect(ratingToRelation("Verdadeiro")).toBe("apoia");
    expect(ratingToRelation("Confirmada")).toBe("apoia");
    // Sem rótulo, ou rótulo qualificado, a relação é sempre a mais cautelosa.
    expect(ratingToRelation(undefined)).toBe("contextualiza");
    expect(ratingToRelation("Parcialmente verdadeiro")).toBe("contextualiza");
    expect(ratingToRelation("Mostly false")).toBe("contextualiza");
  });
});
