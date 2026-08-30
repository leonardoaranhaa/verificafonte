/**
 * Google Fact Check Tools API — busca checagens já publicadas (ClaimReview).
 * Fonte: https://factchecktools.googleapis.com/v1alpha1/claims:search
 * Uso no VerificaFonte: evidência de apoio editorial, NÃO veredito automático.
 */
import { ENV } from "./env";

export type GoogleFactCheckReview = {
  publisherName: string;
  publisherSite: string;
  url: string;
  title: string;
  reviewDate?: string;
  textualRating?: string;
  languageCode?: string;
};

export type GoogleFactCheckClaim = {
  text: string;
  claimant?: string;
  claimDate?: string;
  reviews: GoogleFactCheckReview[];
};

export type GoogleFactCheckSearchResult = {
  claims: GoogleFactCheckClaim[];
  nextPageToken?: string;
  provider: "Google Fact Check Tools";
  query: string;
  note: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Chave da API Google (Fact Check Tools usa API key padrão do Google Cloud). */
export function getGoogleFactCheckApiKey(): string {
  return ENV.googleFactCheckApiKey;
}

export function isGoogleFactCheckConfigured(): boolean {
  return Boolean(getGoogleFactCheckApiKey());
}

/**
 * Busca alegações já checadas por veículos que publicam ClaimReview.
 * @see https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search
 */
export async function searchGoogleFactChecks(params: {
  query: string;
  languageCode?: string;
  pageSize?: number;
  maxAgeDays?: number;
  /** Ex.: aosfatos.org, piaui.folha.uol.com.br */
  reviewPublisherSiteFilter?: string;
}): Promise<GoogleFactCheckSearchResult> {
  const apiKey = getGoogleFactCheckApiKey();
  if (!apiKey) {
    throw new Error(
      "GOOGLE_FACTCHECK_API_KEY (ou GOOGLE_API_KEY) não configurada. Ative Fact Check Tools API no Google Cloud e gere uma chave.",
    );
  }

  const query = params.query.trim().slice(0, 500);
  if (query.length < 5) {
    throw new Error("Consulta muito curta para buscar checagens.");
  }

  const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("languageCode", params.languageCode || "pt-BR");
  url.searchParams.set("pageSize", String(Math.min(Math.max(params.pageSize ?? 10, 1), 20)));
  if (params.maxAgeDays && params.maxAgeDays > 0) {
    url.searchParams.set("maxAgeDays", String(params.maxAgeDays));
  }
  if (params.reviewPublisherSiteFilter) {
    url.searchParams.set("reviewPublisherSiteFilter", params.reviewPublisherSiteFilter);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "VerificaFonteBot/1.0 (fact-check research)",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 403 || response.status === 401) {
      throw new Error(
        "Google Fact Check Tools recusou a chave (403/401). Verifique se a API está habilitada no projeto Google Cloud.",
      );
    }
    throw new Error(`Google Fact Check Tools HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const payload = asRecord(await response.json());
  const claimsRaw = Array.isArray(payload.claims) ? payload.claims : [];
  const claims: GoogleFactCheckClaim[] = [];

  for (const item of claimsRaw) {
    const c = asRecord(item);
    const text = pickString(c.text);
    if (!text) continue;
    const reviewsRaw = Array.isArray(c.claimReview) ? c.claimReview : [];
    const reviews: GoogleFactCheckReview[] = [];
    for (const r of reviewsRaw) {
      const rev = asRecord(r);
      const publisher = asRecord(rev.publisher);
      const urlReview = pickString(rev.url);
      if (!urlReview) continue;
      reviews.push({
        publisherName: pickString(publisher.name) || "Veículo de checagem",
        publisherSite: pickString(publisher.site),
        url: urlReview,
        title: pickString(rev.title) || text.slice(0, 120),
        reviewDate: pickString(rev.reviewDate) || undefined,
        textualRating: pickString(rev.textualRating) || undefined,
        languageCode: pickString(rev.languageCode) || undefined,
      });
    }
    claims.push({
      text,
      claimant: pickString(c.claimant) || undefined,
      claimDate: pickString(c.claimDate) || undefined,
      reviews,
    });
  }

  return {
    claims,
    nextPageToken: pickString(payload.nextPageToken) || undefined,
    provider: "Google Fact Check Tools",
    query,
    note: "Checagens já publicadas por veículos com ClaimReview. Use como evidência de apoio — o veredito do caso VerificaFonte continua editorial e humano.",
  };
}

/**
 * Mapeia o rótulo textual do veículo para uma relação de evidência (heurística cautelosa).
 * Os padrões são radicais (sem \b final) para casar com as flexões do português:
 * "verdadeiro", "confirmada", "enganosa", "distorcido", "desinformação".
 * Rótulo ambíguo ou qualificado ("parcialmente verdadeiro") cai em "contextualiza":
 * a classificação de outro veículo nunca vira, sozinha, o veredito deste caso.
 */
export function ratingToRelation(
  textualRating?: string,
): "apoia" | "contradiz" | "contextualiza" | "neutra" {
  if (!textualRating) return "contextualiza";
  const t = textualRating.toLowerCase();
  const isQualified = /\b(parcial|mostly|almost|half|meio|em parte)/.test(t);

  // Rótulos qualificados não sustentam nem apoio nem contradição plenos.
  if (isQualified) return "contextualiza";

  if (/\b(false|falso|falsa|fake|incorrect|engan|engañ|desinform|mentira|distor|misleading|pants on fire)/.test(t)) {
    return "contradiz";
  }
  if (/\b(true|verdade|verdadeir|correto|correta|correct|confirmad|exato|preciso|accurate)/.test(t)) {
    return "apoia";
  }
  return "contextualiza";
}
