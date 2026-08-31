import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createSessionToken } from "./_core/auth";
import { extractClaimFromImage, extractClaimFromUrl } from "./_core/intake";
import { invokeLLM, isAnthropicConfigured, listLLMModels } from "./_core/llm";
import { emailOpenId, hashPassword, normalizeEmail, verifyPassword } from "./_core/password";
import { BCB_SGS_CATALOG, fetchBcbSgsSeries, suggestBcbSeries } from "./_core/officialSources";
import { isGoogleFactCheckConfigured, ratingToRelation, searchGoogleFactChecks } from "./_core/googleFactCheck";
import {
  addEvidence,
  addReview,
  createCase,
  createResearchTask,
  createHistoricalFindings,
  createSourceMoment,
  listSourceMoments,
  getUserByOpenId,
  listHistoricalFindings,
  markHistoricalFindingEvidence,
  createSourceConnection,
  linkSourceToCase,
  listCaseSourceLinks,
  getCaseBundle,
  getCaseStats,
  getPublishedBundle,
  listCases,
  listPublishedCases,
  listResearchTasks,
  listSourceConnections,
  listUsers,
  setUserRole,
  setSourceConnectionStatus,
  saveAnalysis,
  updateCaseWorkflow,
  upsertUser,
} from "./db";
import { adminProcedure, editorProcedure, publicProcedure, router } from "./_core/trpc";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { isPublicHttpsUrl, safeFetch, UnsafeUrlError } from "./_core/safeFetch";
import { checkRateLimit, RATE_LIMITS } from "./_core/rateLimit";
import { extractAssertions, verifiableIndicators, verifyAssertions } from "./_core/verification";

const registerInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(255).optional(),
});
const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const statusSchema = z.enum(["em_apuracao", "confirmado", "divergente", "insuficiente"]);
const workflowSchema = z.enum(["rascunho", "em_revisao", "publicado", "arquivado"]);
const sourceTypeSchema = z.enum(["oficial", "reportagem", "documento", "outra"]);
const relationSchema = z.enum(["apoia", "contradiz", "contextualiza", "neutra"]);

export const claimInputSchema = z.object({ claimText: z.string().trim().min(12).max(5000), claimUrl: z.string().url().optional().or(z.literal("")) });
export const evidenceInputSchema = z.object({
  caseId: z.number().int().positive(),
  title: z.string().trim().min(4).max(500),
  url: z.string().url(),
  sourceName: z.string().trim().min(2).max(240),
  sourceType: sourceTypeSchema,
  sourceDate: z.string().optional(),
  context: z.string().trim().min(10).max(10000),
  excerpt: z.string().trim().max(10000).optional(),
  relation: relationSchema,
});
export const sourceConnectionInputSchema = z.object({
  name: z.string().trim().min(2).max(240),
  endpoint: z.string().url(),
  sourceType: sourceTypeSchema,
  accessMode: z.enum(["publico", "credencial"]),
  notes: z.string().trim().max(10000).optional(),
});
export const sourceCaseLinkInputSchema = z.object({ caseId: z.number().int().positive(), sourceConnectionId: z.number().int().positive(), priority: z.number().int().min(0).max(100).default(0), active: z.enum(["sim", "nao"]).default("sim") });
export const sourceStatusInputSchema = z.object({ id: z.number().int().positive(), status: z.enum(["ativo", "pausado"]) });
export const sourceProbeInputSchema = z.object({ endpoint: z.string().url() });
export const agentSimulationInputSchema = z.object({ caseId: z.number().int().positive(), endpoint: z.string().url(), objective: z.string().trim().min(12).max(5000), title: z.string().trim().min(4).max(500), sourceName: z.string().trim().min(2).max(240), sourceType: sourceTypeSchema, relation: relationSchema });
export const sourceIngestInputSchema = z.object({
  caseId: z.number().int().positive(),
  endpoint: z.string().url(),
  title: z.string().trim().min(4).max(500),
  sourceName: z.string().trim().min(2).max(240),
  sourceType: sourceTypeSchema,
  relation: relationSchema,
});
export const researchTaskInputSchema = z.object({
  caseId: z.number().int().positive(),
  objective: z.string().trim().min(12).max(5000),
  workerRole: z.enum(["orquestrador", "navegador", "triagem"]),
});
export const historicalSearchInputSchema = z.object({
  caseId: z.number().int().positive(),
  query: z.string().trim().min(3).max(240),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language: z.string().regex(/^(?:[a-z]{2}|por)$/i).default("por"),
  domains: z.array(z.string().trim().min(3).max(120)).max(8).default([]),
  maxRecords: z.number().int().min(1).max(25).default(10),
});

// Domínios .gov.br / .jus.br / .leg.br mais relevantes para checagem de fatos no Brasil.
export const OFFICIAL_SEARCH_SITES = [
  "gov.br",
  "ibge.gov.br",
  "bcb.gov.br",
  "planalto.gov.br",
  "saude.gov.br",
  "anvisa.gov.br",
  "tse.jus.br",
  "stf.jus.br",
  "camara.leg.br",
  "senado.leg.br",
  "agenciabrasil.ebc.com.br",
];

export const crossCheckOfficialInputSchema = z.object({
  caseId: z.number().int().positive(),
  query: z.string().trim().max(200).optional(),
});

export const reviewInputSchema = z.object({
  caseId: z.number().int().positive(),
  decision: z.enum(["aprovar", "solicitar_ajustes", "rejeitar"]),
  note: z.string().trim().min(10).max(10000),
});

export const momentRoleSchema = z.enum(["original", "viral_distorcido", "contextual"]);
export const momentMediaKindSchema = z.enum(["video", "audio", "post", "documento", "outro"]);

/** Indexação de momento: prova original, versão viral/distorcida ou contexto. */
export const sourceMomentInputSchema = z.object({
  caseId: z.number().int().positive(),
  role: momentRoleSchema.default("original"),
  mediaKind: momentMediaKindSchema.default("video"),
  title: z.string().trim().min(4).max(500),
  url: z.string().url(),
  sourceName: z.string().trim().min(2).max(240),
  /** Instante da fala/ato no vídeo ou áudio (segundos) */
  timestampStartSec: z.number().int().min(0).max(86400).optional(),
  timestampEndSec: z.number().int().min(0).max(86400).optional(),
  eventDate: z.string().optional(),
  quoteAtMoment: z.string().trim().max(10000).optional(),
  distortionDescription: z.string().trim().max(10000).optional(),
  linkedOriginalMomentId: z.number().int().positive().optional(),
  /** Também grava uma evidência espelho, para o leitor ver na trilha do caso */
  mirrorAsEvidence: z.boolean().default(true),
});

export const googleFactCheckInputSchema = z.object({
  caseId: z.number().int().positive(),
  query: z.string().trim().max(500).optional(),
  languageCode: z.string().trim().max(10).default("pt-BR"),
  pageSize: z.number().int().min(1).max(20).default(10),
  maxAgeDays: z.number().int().min(1).max(3650).optional(),
});

export const bcbCrossCheckInputSchema = z.object({
  caseId: z.number().int().positive(),
  seriesId: z.number().int().positive().optional(),
  lastN: z.number().int().min(1).max(36).default(12),
  registerEvidence: z.boolean().default(true),
  relation: relationSchema.default("contextualiza"),
});

export const casePipelineInputSchema = z.object({
  caseId: z.number().int().positive(),
  runFactChecks: z.boolean().default(true),
  runOfficialSearch: z.boolean().default(true),
  runBcb: z.boolean().default(true),
});

/**
 * Uma revisão só sustenta publicação se foi feita por outra pessoa que não a
 * autora do caso. Sem essa regra, "exige revisão humana aprovada" seria
 * satisfeito pelo próprio autor aprovando o próprio caso — o que esvazia a
 * garantia editorial que o produto anuncia ao leitor.
 */
export function hasIndependentApproval(
  caseRecord: { createdBy: number | null },
  reviews: Array<{ decision: string; reviewerId: number }>,
) {
  const approved = reviews.filter(review => review.decision === "aprovar");
  // Autoria desconhecida (linha legada): não há autor a quem a revisão possa
  // pertencer, então o risco de auto-aprovação não se aplica e basta a aprovação.
  if (caseRecord.createdBy == null) return approved.length > 0;
  return approved.some(review => review.reviewerId !== caseRecord.createdBy);
}

export function assertPublishable(input: { workflowStatus: z.infer<typeof workflowSchema>; methodology?: string | null; editorialNote?: string | null }, hasApprovedReview: boolean, selfApprovedOnly = false) {
  if (input.workflowStatus !== "publicado") return;
  if (!input.methodology?.trim() || !input.editorialNote?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Preencha a metodologia e a justificativa pública antes de publicar este caso." });
  }
  if (!hasApprovedReview) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: selfApprovedOnly
        ? "A única revisão aprovada deste caso é de quem o criou. A publicação exige revisão de outra pessoa da redação."
        : "Registre uma revisão humana aprovada antes de publicar este caso.",
    });
  }
}

/**
 * Origem aproximada da requisição, para limitar login e cadastro.
 * Atrás do proxy do Railway o IP real vem em x-forwarded-for; usamos o primeiro
 * salto e caímos para o socket quando o cabeçalho não existe.
 */
function clientIdentity(req: { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === "string" ? forwarded : "";
  const first = raw.split(",")[0]?.trim();
  return first || req.ip || req.socket?.remoteAddress || "desconhecido";
}

function cleanOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toGdeltDate(value: string, endOfDay = false) {
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  if (Number.isNaN(parsed.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe datas válidas para a pesquisa." });
  return parsed;
}

export function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return value;
  }
}

// Guarda única, compartilhada com o intake e o safeFetch.
const isPublicHttps = isPublicHttpsUrl;

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function rssField(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

export function parseHistoricalRss(raw: string, maxRecords: number, domains: string[], language: string, accessedAt: string) {
  const candidates = Array.from(raw.matchAll(/<item>([\s\S]*?)<\/item>/gi)).slice(0, maxRecords * 2).map(match => match[1]);
  const seen = new Set<string>();
  return candidates.map(item => {
    const discoveryUrl = canonicalizeUrl(rssField(item, "link"));
    const publisher = rssField(item, "source");
    if (!discoveryUrl || (domains.length && !domains.some(domain => publisher.toLowerCase().includes(domain.toLowerCase()))) || seen.has(discoveryUrl)) return null;
    seen.add(discoveryUrl);
    return { url: discoveryUrl, discoveryUrl, title: rssField(item, "title") || "Sem título informado", publishedAt: rssField(item, "pubDate") || null, publisher: publisher || "Origem não informada", language, sourceCountry: "BR", discoverySource: "Google Notícias RSS", accessedAt, needsEditorialOpen: true };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, maxRecords);
}

async function resolvePublicUrl(value: string) {
  try {
    if (!isPublicHttps(value)) return value;
    const response = await safeFetch(value, { timeoutMs: 6000, headers: { accept: "text/html,application/xhtml+xml" } });
    await response.body?.cancel();
    return isPublicHttps(response.url) ? canonicalizeUrl(response.url) : canonicalizeUrl(value);
  } catch {
    return canonicalizeUrl(value);
  }
}

async function runDiscovery(input: {
  caseId: number;
  query: string;
  searchKeySeed: string;
  startDate: string;
  endDate: string;
  language: string;
  domains: string[];
  maxRecords: number;
  objective: string;
  requestedBy: number;
}) {
  const start = toGdeltDate(input.startDate);
  const end = toGdeltDate(input.endDate, true);
  if (start > end) throw new TRPCError({ code: "BAD_REQUEST", message: "A data inicial deve ser anterior à data final." });
  const maxWindowMs = 366 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxWindowMs) throw new TRPCError({ code: "BAD_REQUEST", message: "A janela histórica máxima nesta busca é de 366 dias." });
  const task = await createResearchTask({ caseId: input.caseId, objective: input.objective, workerRole: "navegador", requestedBy: input.requestedBy });
  const apiUrl = new URL("https://news.google.com/rss/search");
  const periodQuery = `${input.query} after:${input.startDate} before:${input.endDate}`;
  apiUrl.searchParams.set("q", periodQuery);
  apiUrl.searchParams.set("hl", input.language === "por" ? "pt-BR" : input.language);
  apiUrl.searchParams.set("gl", "BR");
  apiUrl.searchParams.set("ceid", "BR:pt-419");
  try {
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(12000), headers: { accept: "application/rss+xml, application/xml, text/xml" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.text();
    const accessedAt = new Date().toISOString();
    const parsed = parseHistoricalRss(raw, input.maxRecords, input.domains, input.language, accessedAt);
    const results = await Promise.all(parsed.map(async item => ({ ...item, url: await resolvePublicUrl(item.url) })));
    const searchKey = `${input.caseId}:${input.searchKeySeed.trim().toLowerCase()}:${input.startDate}:${input.endDate}`.slice(0, 255);
    const persisted = await createHistoricalFindings(results.map(item => ({ caseId: input.caseId, taskId: task?.id, searchKey, queryText: input.query.slice(0, 240), discoveryUrl: item.discoveryUrl, finalUrl: item.url, title: item.title, publisher: item.publisher, publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined, accessedAt: new Date(item.accessedAt), needsEditorialOpen: "sim" as const, createdBy: input.requestedBy })));
    const resultsWithIds = results.map((item, index) => ({ ...item, findingId: persisted[index]?.id ?? null }));
    return { task, query: input.query, startDate: input.startDate, endDate: input.endDate, provider: "Google Notícias RSS", results: resultsWithIds, persisted };
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A busca não conseguiu consultar o índice público agora." });
  }
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** Aceita ISO (2026-08-30) ou dd/mm/aaaa; devolve undefined se não for data válida. */
export function safeParseDate(value?: string) {
  const raw = value?.trim();
  if (!raw) return undefined;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const parsed = br ? new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00Z`) : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** "1h02m03s" legível a partir de segundos, para ancorar o instante da fala. */
export function formatTimecode(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h > 0 ? `${h}h` : "", h > 0 || m > 0 ? `${String(m).padStart(h > 0 ? 2 : 1, "0")}m` : "", `${String(sec).padStart(2, "0")}s`].join("");
}

/** Link direto para o instante no YouTube; nas demais mídias devolve a própria URL. */
export function momentDeepLink(url: string, startSec?: number | null) {
  if (startSec == null || startSec < 0) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      parsed.searchParams.set("t", `${Math.floor(startSec)}s`);
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function sanitizeUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function readLLMText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(item => (typeof item === "object" && item && "text" in item ? String(item.text) : "")).join("");
  }
  return "";
}

export const appRouter = router({
  /** Gestão de acesso à redação. Só admin — o bootstrap é via OWNER_OPEN_ID. */
  admin: router({
    users: adminProcedure.query(() => listUsers()),
    setRole: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "editor", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id && input.role !== "admin") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Você não pode rebaixar a própria conta — outro admin precisa fazer isso, para não sobrar nenhum administrador.",
          });
        }
        const updated = await setUserRole(input.userId, input.role);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
        return updated;
      }),
  }),
  system: router({
    health: publicProcedure.query(() => ({ ok: true })),
    /**
     * Prontidão das integrações — ponto único de verdade para o painel avisar
     * o que está configurado antes de o editor começar, em vez de a falta de
     * uma chave só aparecer como erro no meio do fluxo.
     */
    integrations: editorProcedure.query(() => [
      {
        key: "anthropic" as const,
        label: "Extração e briefings (IA)",
        ready: isAnthropicConfigured(),
        requires: "ANTHROPIC_API_KEY",
        enables: "Extrair alegação de link e print, briefing de revisão e laudo de fala.",
      },
      {
        key: "googleFactCheck" as const,
        label: "Checagens já publicadas",
        ready: isGoogleFactCheckConfigured(),
        requires: "GOOGLE_FACTCHECK_API_KEY",
        enables: "Buscar checagens de outros veículos (ClaimReview) sobre a mesma alegação.",
      },
      {
        key: "bcb" as const,
        label: "Dados oficiais do Banco Central",
        ready: true,
        requires: null,
        enables: "Consultar séries oficiais (IPCA, Selic, câmbio). API pública, sem credencial.",
      },
    ]),
  }),
  auth: router({
    me: publicProcedure.query(opts => (opts.ctx.user ? sanitizeUser(opts.ctx.user) : null)),
    register: publicProcedure.input(registerInputSchema).mutation(async ({ input, ctx }) => {
      checkRateLimit(clientIdentity(ctx.req), RATE_LIMITS.register);
      const openId = emailOpenId(input.email);
      if (await getUserByOpenId(openId)) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com este e-mail." });
      }
      const passwordHash = await hashPassword(input.password);
      await upsertUser({
        openId,
        email: normalizeEmail(input.email),
        name: input.name ?? null,
        loginMethod: "email",
        passwordHash,
        lastSignedIn: new Date(),
      });
      const user = await getUserByOpenId(openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a conta." });
      const token = await createSessionToken({ openId: user.openId, name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return sanitizeUser(user);
    }),
    login: publicProcedure.input(loginInputSchema).mutation(async ({ input, ctx }) => {
      // Por e-mail e por origem: trava força bruta numa conta e varredura de contas.
      checkRateLimit(emailOpenId(input.email), RATE_LIMITS.login);
      checkRateLimit(clientIdentity(ctx.req), RATE_LIMITS.login);
      const openId = emailOpenId(input.email);
      const user = await getUserByOpenId(openId);
      if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
      }
      await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const token = await createSessionToken({ openId: user.openId, name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return sanitizeUser(user);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  intake: router({
    extractFromUrl: editorProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input, ctx }) => {
        checkRateLimit(ctx.user.id, RATE_LIMITS.intake);
        try {
          return await extractClaimFromUrl(input.url);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível extrair a alegação deste link." });
        }
      }),
    extractFromImage: editorProcedure
      .input(z.object({ imageDataUrl: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        checkRateLimit(ctx.user.id, RATE_LIMITS.intake);
        try {
          return await extractClaimFromImage(input.imageDataUrl);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível extrair a alegação deste print." });
        }
      }),
  }),
  cases: router({
    published: publicProcedure.query(() => listPublishedCases()),
    publicBySlug: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(({ input }) => getPublishedBundle(input.slug)),
    stats: publicProcedure.query(() => getCaseStats()),
    workspace: editorProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input }) => getCaseBundle(input.caseId)),
    all: editorProcedure.query(() => listCases()),
    create: editorProcedure
      .input(claimInputSchema)
      .mutation(async ({ input, ctx }) => {
        const claimUrl = cleanOptional(input.claimUrl);
        if (claimUrl && !isPublicHttpsUrl(claimUrl)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A URL de origem precisa ser HTTPS pública (sem localhost ou IP privado).",
          });
        }
        const base = input.claimText.toLowerCase().replace(/[^a-z0-9à-ú]+/gi, "-").replace(/(^-|-$)/g, "").slice(0, 110);
        return createCase({
          slug: `${base || "caso"}-${nanoid(7).toLowerCase()}`,
          claimText: input.claimText.trim(),
          claimUrl,
          createdBy: ctx.user.id,
        });
      }),
    updateWorkflow: editorProcedure
      .input(z.object({
        caseId: z.number().int().positive(),
        workflowStatus: workflowSchema,
        status: statusSchema.optional(),
        methodology: z.string().trim().max(10000).optional(),
        editorialNote: z.string().trim().max(10000).optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.workflowStatus === "publicado") {
          const bundle = await getCaseBundle(input.caseId);
          if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
          const independent = hasIndependentApproval(bundle.caseRecord, bundle.reviewRows);
          const selfApprovedOnly = !independent && bundle.reviewRows.some(review => review.decision === "aprovar");
          assertPublishable(input, independent, selfApprovedOnly);
        }
        return updateCaseWorkflow(input);
      }),
  }),
  evidences: router({
    add: editorProcedure
      .input(evidenceInputSchema)
      .mutation(({ input }) => {
        if (!isPublicHttpsUrl(input.url)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A URL da evidência precisa ser HTTPS pública (sem localhost ou IP privado).",
          });
        }
        return addEvidence({
          ...input,
          sourceDate: input.sourceDate ? new Date(input.sourceDate) : undefined,
          excerpt: cleanOptional(input.excerpt),
        });
      }),
  }),
  reviews: router({
    submit: editorProcedure
      .input(reviewInputSchema)
      .mutation(({ input, ctx }) => addReview({ ...input, reviewerId: ctx.user.id })),
  }),
  sources: router({
    list: editorProcedure.query(() => listSourceConnections()),
    create: editorProcedure.input(sourceConnectionInputSchema).mutation(({ input, ctx }) => createSourceConnection({ ...input, notes: cleanOptional(input.notes), createdBy: ctx.user.id })),
    setStatus: editorProcedure.input(sourceStatusInputSchema).mutation(({ input }) => setSourceConnectionStatus(input.id, input.status)),
    forCase: editorProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input }) => listCaseSourceLinks(input.caseId)),
    linkToCase: editorProcedure.input(sourceCaseLinkInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      return linkSourceToCase({ ...input, createdBy: ctx.user.id });
    }),
    ingest: editorProcedure.input(sourceIngestInputSchema).mutation(async ({ input }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      if (!isPublicHttpsUrl(input.endpoint)) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas endpoints HTTPS públicos podem ser ingeridos." });
      const url = input.endpoint;
      try {
        const response = await safeFetch(url, { timeoutMs: 10000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.text();
        const excerpt = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
        if (!excerpt) throw new Error("empty");
        return addEvidence({
          caseId: input.caseId,
          title: input.title,
          url: input.endpoint,
          sourceName: input.sourceName,
          sourceType: input.sourceType,
          context: `Captura autorizada em ${new Date().toLocaleString("pt-BR")}. O conteúdo abaixo é um retorno bruto para leitura editorial; ele não constitui veredito.`,
          excerpt,
          relation: input.relation,
        });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ingerir conteúdo deste endpoint público agora." });
      }
    }),
    probe: editorProcedure.input(sourceProbeInputSchema).mutation(async ({ input }) => {
      if (!isPublicHttpsUrl(input.endpoint)) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas endpoints HTTPS públicos podem ser testados." });
      try {
        const response = await safeFetch(input.endpoint, { timeoutMs: 8000 });
        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type") ?? "não informado",
          retrievedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível consultar este endpoint público agora." });
      }
    }),
  }),
  research: router({
    list: editorProcedure.input(z.object({ caseId: z.number().int().positive().optional() }).optional()).query(({ input }) => listResearchTasks(input?.caseId)),
    create: editorProcedure.input(researchTaskInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      return createResearchTask({ ...input, requestedBy: ctx.user.id });
    }),
    findings: editorProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input }) => listHistoricalFindings(input.caseId)),
    discover: editorProcedure.input(historicalSearchInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      return runDiscovery({
        ...input,
        searchKeySeed: input.query,
        objective: `Descobrir cobertura histórica para: ${input.query} (${input.startDate} a ${input.endDate})`,
        requestedBy: ctx.user.id,
      });
    }),
    crossCheckOfficial: editorProcedure.input(crossCheckOfficialInputSchema).mutation(async ({ input, ctx }) => {
      checkRateLimit(ctx.user.id, RATE_LIMITS.research);
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const baseQuery = cleanOptional(input.query) ?? bundle.caseRecord.claimText.slice(0, 200);
      const siteFilter = OFFICIAL_SEARCH_SITES.map(site => `site:${site}`).join(" OR ");
      const end = new Date();
      const start = new Date(end.getTime() - 180 * 24 * 60 * 60 * 1000);
      return runDiscovery({
        caseId: input.caseId,
        query: `${baseQuery} (${siteFilter})`,
        searchKeySeed: `oficial:${baseQuery}`,
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        language: "por",
        domains: [],
        maxRecords: 10,
        objective: `Cruzar a alegação com fontes oficiais (.gov.br/.jus.br/.leg.br): ${baseQuery}`,
        requestedBy: ctx.user.id,
      });
    }),
    simulateReturn: editorProcedure.input(agentSimulationInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const task = await createResearchTask({ caseId: input.caseId, objective: input.objective, workerRole: "navegador", requestedBy: ctx.user.id });
      if (!isPublicHttpsUrl(input.endpoint)) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas endpoints HTTPS públicos podem ser consultados." });
      const url = input.endpoint;
      try {
        const response = await safeFetch(url, { timeoutMs: 10000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.text();
        const excerpt = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
        if (!excerpt) throw new Error("empty");
        const evidence = await addEvidence({ caseId: input.caseId, title: input.title, url: input.endpoint, sourceName: input.sourceName, sourceType: input.sourceType, context: `Retorno simulado da tarefa #${task?.id ?? ""}. Conteúdo bruto para leitura editorial; não constitui veredito.`, excerpt, relation: input.relation });
        return { task, evidence };
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A simulação não conseguiu consultar o endpoint público." });
      }
    }),
    /** Checagens já publicadas por veículos com ClaimReview (Google Fact Check Tools). */
    googleFactChecks: editorProcedure.input(googleFactCheckInputSchema).mutation(async ({ input, ctx }) => {
      checkRateLimit(ctx.user.id, RATE_LIMITS.research);
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      if (!isGoogleFactCheckConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GOOGLE_FACTCHECK_API_KEY não configurada. Habilite a Fact Check Tools API no Google Cloud e defina a chave.",
        });
      }
      const query = cleanOptional(input.query) ?? bundle.caseRecord.claimText.slice(0, 300);
      const task = await createResearchTask({
        caseId: input.caseId,
        objective: `Buscar checagens publicadas (ClaimReview) para: ${query}`.slice(0, 5000),
        workerRole: "triagem",
        requestedBy: ctx.user.id,
      });
      try {
        const result = await searchGoogleFactChecks({
          query,
          languageCode: input.languageCode,
          pageSize: input.pageSize,
          maxAgeDays: input.maxAgeDays,
        });
        // Achados são candidatos: o editor abre, confere e registra como evidência.
        const candidates = result.claims.flatMap(claim =>
          claim.reviews.map(review => ({
            claimText: claim.text,
            claimant: claim.claimant,
            claimDate: claim.claimDate,
            publisherName: review.publisherName,
            url: review.url,
            title: review.title,
            reviewDate: review.reviewDate,
            textualRating: review.textualRating,
            suggestedRelation: ratingToRelation(review.textualRating),
          })),
        );
        return {
          task,
          provider: result.provider,
          query: result.query,
          candidates,
          note: result.note,
        };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Falha ao consultar o Google Fact Check." });
      }
    }),
    /**
     * "Rodar fluxo completo": dispara em paralelo as fontes disponíveis e devolve
     * material para leitura editorial. Nenhuma etapa decide status ou veredito.
     */
    prepareCasePipeline: editorProcedure.input(casePipelineInputSchema).mutation(async ({ input, ctx }) => {
      checkRateLimit(ctx.user.id, RATE_LIMITS.research);
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const claimText = bundle.caseRecord.claimText;

      const officialQuery = claimText.slice(0, 200);
      const end = new Date();
      const start = new Date(end.getTime() - 180 * 24 * 60 * 60 * 1000);

      type Step = { step: string; status: "ok" | "pulado" | "erro"; detail: string };
      type FactCandidate = {
        claimText: string;
        claimant?: string;
        publisherName: string;
        url: string;
        title: string;
        reviewDate?: string;
        textualRating?: string;
        suggestedRelation: "apoia" | "contradiz" | "contextualiza" | "neutra";
      };

      // Cada etapa devolve o próprio step — evita corrida em array compartilhado no Promise.all.
      const [factPart, officialPart, bcbPart] = await Promise.all([
        (async (): Promise<{ step: Step; data: FactCandidate[] | null }> => {
          if (!input.runFactChecks) {
            return { step: { step: "Google Fact Check", status: "pulado", detail: "Etapa desligada neste disparo." }, data: null };
          }
          if (!isGoogleFactCheckConfigured()) {
            return {
              step: { step: "Google Fact Check", status: "pulado", detail: "GOOGLE_FACTCHECK_API_KEY não configurada." },
              data: null,
            };
          }
          try {
            const result = await searchGoogleFactChecks({ query: claimText.slice(0, 300), languageCode: "pt-BR", pageSize: 10 });
            const candidates = result.claims.flatMap(claim =>
              claim.reviews.map(review => ({
                claimText: claim.text,
                claimant: claim.claimant,
                publisherName: review.publisherName,
                url: review.url,
                title: review.title,
                reviewDate: review.reviewDate,
                textualRating: review.textualRating,
                suggestedRelation: ratingToRelation(review.textualRating),
              })),
            );
            return {
              step: {
                step: "Google Fact Check",
                status: "ok",
                detail: `${candidates.length} checagem(ns) publicada(s) encontrada(s).`,
              },
              data: candidates,
            };
          } catch (error) {
            return {
              step: {
                step: "Google Fact Check",
                status: "erro",
                detail: error instanceof Error ? error.message : "falha",
              },
              data: null,
            };
          }
        })(),
        (async (): Promise<{ step: Step; data: Awaited<ReturnType<typeof runDiscovery>> | null }> => {
          if (!input.runOfficialSearch) {
            return { step: { step: "Fontes oficiais", status: "pulado", detail: "Etapa desligada neste disparo." }, data: null };
          }
          try {
            const siteFilter = OFFICIAL_SEARCH_SITES.map(site => `site:${site}`).join(" OR ");
            const result = await runDiscovery({
              caseId: input.caseId,
              query: `${officialQuery} (${siteFilter})`,
              searchKeySeed: `pipeline-oficial:${officialQuery}`,
              startDate: toIsoDate(start),
              endDate: toIsoDate(end),
              language: "por",
              domains: [],
              maxRecords: 10,
              objective: `Fluxo completo — cruzar com fontes oficiais: ${officialQuery}`,
              requestedBy: ctx.user.id,
            });
            return {
              step: {
                step: "Fontes oficiais",
                status: "ok",
                detail: `${result.results.length} candidato(s) em domínios oficiais.`,
              },
              data: result,
            };
          } catch (error) {
            return {
              step: {
                step: "Fontes oficiais",
                status: "erro",
                detail: error instanceof Error ? error.message : "falha",
              },
              data: null,
            };
          }
        })(),
        (async (): Promise<{
          step: Step;
          data: { suggestions: ReturnType<typeof suggestBcbSeries>; series: Awaited<ReturnType<typeof fetchBcbSgsSeries>> } | null;
        }> => {
          if (!input.runBcb) {
            return { step: { step: "BCB SGS", status: "pulado", detail: "Etapa desligada neste disparo." }, data: null };
          }
          const suggestions = suggestBcbSeries(claimText);
          if (!suggestions.length) {
            return {
              step: {
                step: "BCB SGS",
                status: "pulado",
                detail: "A alegação não cita indicador econômico do catálogo.",
              },
              data: null,
            };
          }
          try {
            const series = await fetchBcbSgsSeries({ seriesId: suggestions[0].id, lastN: 12 });
            return {
              step: {
                step: "BCB SGS",
                status: "ok",
                detail: `${series.seriesName}: ${series.points.length} ponto(s).`,
              },
              data: { suggestions, series },
            };
          } catch (error) {
            return {
              step: {
                step: "BCB SGS",
                status: "erro",
                detail: error instanceof Error ? error.message : "falha",
              },
              data: null,
            };
          }
        })(),
      ]);

      const steps = [factPart.step, officialPart.step, bcbPart.step];
      const failed = steps.filter(s => s.status === "erro").length;

      return {
        caseId: input.caseId,
        steps,
        factChecks: factPart.data,
        officialDiscovery: officialPart.data,
        bcb: bcbPart.data,
        summary: {
          total: steps.length,
          ok: steps.filter(s => s.status === "ok").length,
          skipped: steps.filter(s => s.status === "pulado").length,
          failed,
        },
        editorialNote:
          failed > 0
            ? "Algumas etapas falharam, mas o material parcial está disponível. Confira cada item, registre evidências e decida o status com revisão humana."
            : "Material preparado para leitura editorial. Abra cada item, confira a fonte primária e registre como evidência. O status e o veredito continuam sendo decisão humana.",
      };
    }),
    recordFinding: editorProcedure.input(evidenceInputSchema.extend({ taskId: z.number().int().positive().optional(), findingId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const evidence = await addEvidence({
        caseId: input.caseId,
        title: input.title,
        url: input.url,
        sourceName: input.sourceName,
        sourceType: input.sourceType,
        context: input.taskId ? `Retorno da tarefa #${input.taskId}. ${input.context}` : input.context,
        excerpt: cleanOptional(input.excerpt),
        relation: input.relation,
      });
      if (input.findingId) await markHistoricalFindingEvidence(input.findingId, evidence.id);
      return evidence;
    }),
  }),
  /** Dados oficiais consultáveis sem credencial (BCB SGS). */
  /**
   * Verificação automática das afirmações quantitativas da alegação.
   *
   * Produz um veredito TÉCNICO por afirmação ("o número confere com a fonte
   * oficial"), obtido por comparação aritmética reproduzível. Não altera o
   * status do caso nem publica: a decisão editorial segue humana.
   */
  verification: router({
    catalog: editorProcedure.query(() => ({ indicators: verifiableIndicators() })),
    checkCase: editorProcedure
      .input(z.object({ caseId: z.number().int().positive(), registerEvidence: z.boolean().default(false) }))
      .mutation(async ({ input, ctx }) => {
        checkRateLimit(ctx.user.id, RATE_LIMITS.research);
        const bundle = await getCaseBundle(input.caseId);
        if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });

        let assertions: Awaited<ReturnType<typeof extractAssertions>>;
        try {
          assertions = await extractAssertions(bundle.caseRecord.claimText);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível ler as afirmações desta alegação." });
        }

        if (!assertions.length) {
          return {
            assertions: [],
            checks: [],
            corroborations: [],
            summary: { counts: { confere: 0, confere_arredondado: 0, diverge: 0, nao_verificavel: 0 }, overall: "sem_afirmacoes" as const, total: 0 },
            evidence: [],
            editorialNote: "Nenhuma afirmação numérica desta alegação corresponde a um indicador do catálogo. A checagem deste caso é inteiramente editorial.",
          };
        }

        const { checks, corroborations, summary } = await verifyAssertions(assertions);

        // A evidência registra o resultado da conferência com os dois números,
        // para o leitor poder refazer a conta a partir da fonte citada.
        const evidence: Array<Awaited<ReturnType<typeof addEvidence>>> = [];
        if (input.registerEvidence) {
          for (const check of checks) {
            if (!check.official) continue;
            evidence.push(
              await addEvidence({
                caseId: input.caseId,
                title: `Conferência automática — ${check.assertion.indicator} (${check.outcome})`.slice(0, 500),
                url: check.official.sourceUrl,
                sourceName: check.official.sourceName,
                sourceType: "oficial",
                sourceDate: safeParseDate(check.official.period),
                context: `${check.explanation} Trecho conferido: "${check.assertion.excerpt}". Comparação aritmética reproduzível; a leitura editorial do caso continua humana.`,
                excerpt: `Afirmado: ${check.assertion.value}${check.assertion.unit ? ` ${check.assertion.unit}` : ""} · Oficial: ${check.official.value}${check.official.unit ? ` ${check.official.unit}` : ""} · Período: ${check.official.period}`,
                relation: check.outcome === "diverge" ? "contradiz" : check.outcome === "nao_verificavel" ? "neutra" : "apoia",
              }),
            );
          }
        }

        return {
          assertions,
          checks,
          corroborations,
          summary,
          evidence,
          editorialNote:
            summary.overall === "diverge"
              ? "Ao menos um número da alegação diverge da fonte oficial. Confira a série e o período antes de decidir o status."
              : summary.overall === "confere"
                ? "Os números conferem com as fontes oficiais consultadas. O status do caso continua sendo decisão sua."
                : "Confira os pontos marcados como aproximados ou não verificáveis.",
        };
      }),
  }),
  official: router({
    catalog: editorProcedure.query(() => ({
      bcbSgs: Object.entries(BCB_SGS_CATALOG).map(([key, meta]) => ({
        key,
        id: meta.id,
        name: meta.name,
        unit: meta.unit,
        keywords: meta.keywords,
      })),
    })),
    suggest: editorProcedure
      .input(z.object({ claimText: z.string().trim().min(3).max(5000) }))
      .query(({ input }) => ({ suggestions: suggestBcbSeries(input.claimText) })),
    bcbSeries: editorProcedure
      .input(z.object({
        seriesId: z.number().int().positive(),
        monthsBack: z.number().int().min(1).max(60).default(12),
        lastN: z.number().int().min(1).max(36).default(12),
      }))
      .mutation(async ({ input }) => {
        try {
          return await fetchBcbSgsSeries(input);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Falha ao consultar o BCB" });
        }
      }),
    /** Deriva a série da própria alegação e registra evidência candidata. */
    crossCheckBcb: editorProcedure.input(bcbCrossCheckInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const suggestions = suggestBcbSeries(bundle.caseRecord.claimText);
      const seriesId = input.seriesId ?? suggestions[0]?.id;
      if (!seriesId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhuma série do BCB é óbvia para esta alegação. Escolha um ID do catálogo (ex.: 433 = IPCA).",
        });
      }
      const task = await createResearchTask({
        caseId: input.caseId,
        objective: `Consultar série ${seriesId} no BCB SGS`,
        workerRole: "navegador",
        requestedBy: ctx.user.id,
      });
      try {
        const series = await fetchBcbSgsSeries({ seriesId, lastN: input.lastN });
        const latest = series.points[series.points.length - 1];
        const pointsSummary = series.points
          .slice(-8)
          .map(point => `${point.date}: ${point.value}${series.unit ? ` ${series.unit}` : ""}`)
          .join(" | ");
        let evidence = null as Awaited<ReturnType<typeof addEvidence>> | null;
        if (input.registerEvidence) {
          evidence = await addEvidence({
            caseId: input.caseId,
            title: `BCB SGS — ${series.seriesName}${latest ? ` (${latest.date}: ${latest.value})` : ""}`.slice(0, 500),
            url: series.sourceUrl,
            sourceName: "Banco Central do Brasil (SGS)",
            sourceType: "oficial",
            sourceDate: safeParseDate(latest?.date),
            context: `Retorno da tarefa #${task?.id ?? ""}. Série oficial ${series.seriesId} (${series.seriesName}). Não constitui veredito — compare com a alegação e ajuste a relação se necessário.`,
            excerpt: pointsSummary.slice(0, 4000) || "Sem pontos na janela consultada.",
            relation: input.relation,
          });
        }
        return {
          task,
          suggestions,
          series,
          evidence,
          editorialNote: "Evidência candidata a partir de dado oficial do BCB. Revise números, datas e a relação antes de publicar.",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Falha ao consultar o BCB" });
      }
    }),
  }),
  /**
   * Momentos indexados: prova original × versão viral/distorcida.
   * Ancora o instante da fala e descreve o que a versão viral cortou ou omitiu.
   */
  moments: router({
    list: editorProcedure
      .input(z.object({ caseId: z.number().int().positive() }))
      .query(({ input }) => listSourceMoments(input.caseId)),
    register: editorProcedure.input(sourceMomentInputSchema).mutation(async ({ input, ctx }) => {
      // Valida a entrada antes de consultar o banco: entrada malformada não
      // precisa de ida ao MySQL, e a ordem fica igual à de cases.create e
      // evidences.add.
      if (!isPublicHttpsUrl(input.url)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A URL do momento precisa ser HTTPS pública (sem localhost ou IP privado).",
        });
      }
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      if (input.timestampStartSec != null && input.timestampEndSec != null && input.timestampEndSec < input.timestampStartSec) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O fim do trecho deve ser posterior ao início." });
      }
      if (input.role === "viral_distorcido" && !cleanOptional(input.distortionDescription)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Descreva a distorção (o que foi cortado, omitido ou refraseado) ao indexar a versão viral.",
        });
      }
      if (input.linkedOriginalMomentId != null) {
        const existing = await listSourceMoments(input.caseId);
        const target = existing.find(moment => moment.id === input.linkedOriginalMomentId);
        if (!target) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O momento original vinculado não pertence a este caso." });
        }
        if (target.role !== "original") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Vincule a versão viral a um momento marcado como prova original." });
        }
      }

      const moment = await createSourceMoment({
        caseId: input.caseId,
        role: input.role,
        mediaKind: input.mediaKind,
        title: input.title.trim(),
        url: input.url,
        sourceName: input.sourceName.trim(),
        timestampStartSec: input.timestampStartSec,
        timestampEndSec: input.timestampEndSec,
        eventDate: safeParseDate(input.eventDate),
        quoteAtMoment: cleanOptional(input.quoteAtMoment),
        distortionDescription: cleanOptional(input.distortionDescription),
        linkedOriginalMomentId: input.linkedOriginalMomentId,
        createdBy: ctx.user.id,
      });

      let evidence = null as Awaited<ReturnType<typeof addEvidence>> | null;
      if (input.mirrorAsEvidence) {
        const roleLabel =
          input.role === "original" ? "PROVA ORIGINAL" : input.role === "viral_distorcido" ? "VERSÃO VIRAL / DISTORCIDA" : "CONTEXTO";
        const timecode =
          input.timestampStartSec != null
            ? ` [${formatTimecode(input.timestampStartSec)}${input.timestampEndSec != null ? `–${formatTimecode(input.timestampEndSec)}` : ""}]`
            : "";
        evidence = await addEvidence({
          caseId: input.caseId,
          title: `${roleLabel}: ${input.title.trim()}`.slice(0, 500),
          url: momentDeepLink(input.url, input.timestampStartSec),
          sourceName: input.sourceName.trim(),
          sourceType: input.role === "original" ? "documento" : "outra",
          sourceDate: safeParseDate(input.eventDate),
          context: [
            `${roleLabel}${timecode}.`,
            cleanOptional(input.quoteAtMoment) ? `Trecho no momento: ${input.quoteAtMoment!.trim()}` : null,
            cleanOptional(input.distortionDescription) ? `Distorção identificada: ${input.distortionDescription!.trim()}` : null,
            input.linkedOriginalMomentId ? `Vinculado ao momento original #${input.linkedOriginalMomentId}.` : null,
            "Indexação de momento — apoio editorial, não veredito automático.",
          ]
            .filter(Boolean)
            .join(" "),
          excerpt: cleanOptional(input.quoteAtMoment) ?? cleanOptional(input.distortionDescription),
          relation: input.role === "viral_distorcido" ? "contradiz" : input.role === "original" ? "contextualiza" : "neutra",
        });
      }

      return {
        moment,
        evidence,
        editorialNote:
          input.role === "original"
            ? "Prova original indexada. Use o instante para ancorar a fala ou o ato."
            : input.role === "viral_distorcido"
              ? "Versão viral indexada com a distorção descrita. Vincule-a à prova original para o leitor comparar."
              : "Momento de contexto indexado.",
      };
    }),
  }),
  analysis: router({
    generate: editorProcedure
      .input(z.object({ caseId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        checkRateLimit(ctx.user.id, RATE_LIMITS.analysis);
        const bundle = await getCaseBundle(input.caseId);
        if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
        const { data } = await listLLMModels();
        const model = data.find(item => /claude|gemini|gpt/i.test(item.id))?.id ?? data[0]?.id;
        const evidenceContext = bundle.evidenceRows.length
          ? bundle.evidenceRows.map((evidence, index) => `${index + 1}. ${evidence.title} | ${evidence.sourceName} | ${evidence.relation}\nURL: ${evidence.url}\nContexto: ${evidence.context}\nTrecho: ${evidence.excerpt ?? "não informado"}`).join("\n\n")
          : "Nenhuma evidência foi cadastrada ainda.";
        const response = await invokeLLM({
          model,
          messages: [
            {
              role: "system",
              content: "Você é um assistente de pesquisa para uma redação de checagem de fatos. Organize evidências e divergências para revisão humana. Nunca escolha, sugira ou determine um veredito final. Não invente fatos, fontes ou links. Se faltarem evidências, diga explicitamente.",
            },
            {
              role: "user",
              content: `Alegação do caso:\n${bundle.caseRecord.claimText}\n\nEvidências registradas:\n${evidenceContext}\n\nProduza um briefing interno, com linguagem clara e cautelosa.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "fact_check_review_brief",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  extractedClaim: { type: "string" },
                  evidenceSummary: { type: "string" },
                  divergences: { type: "string" },
                  reviewBrief: { type: "string" },
                },
                required: ["extractedClaim", "evidenceSummary", "divergences", "reviewBrief"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = readLLMText(response.choices?.[0]?.message?.content);
        let parsed: { extractedClaim: string; evidenceSummary: string; divergences: string; reviewBrief: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O modelo retornou um formato que precisa de revisão técnica." });
        }
        return saveAnalysis({ ...parsed, caseId: input.caseId, modelLabel: model });
      }),
    /**
     * Laudo "fulano disse isso?" — avalia atribuição da fala e uso fora de contexto.
     * Produz material para o editor; não decide o veredito público.
     */
    quoteLaudo: editorProcedure
      .input(z.object({
        caseId: z.number().int().positive(),
        attributedPerson: z.string().trim().min(2).max(200).optional(),
        allegedQuote: z.string().trim().min(8).max(5000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        checkRateLimit(ctx.user.id, RATE_LIMITS.analysis);
        const bundle = await getCaseBundle(input.caseId);
        if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
        const { data } = await listLLMModels();
        const model = data.find(item => /claude|gemini|gpt/i.test(item.id))?.id ?? data[0]?.id;

        const evidenceContext = bundle.evidenceRows.length
          ? bundle.evidenceRows.map((evidence, index) => `${index + 1}. ${evidence.title} | ${evidence.sourceName} | relação: ${evidence.relation}\nURL: ${evidence.url}\nContexto: ${evidence.context}\nTrecho: ${evidence.excerpt ?? "não informado"}`).join("\n\n")
          : "Nenhuma evidência cadastrada ainda.";
        const momentContext = bundle.momentRows.length
          ? bundle.momentRows.map(moment => {
              const timecode = moment.timestampStartSec != null ? ` [${formatTimecode(moment.timestampStartSec)}]` : "";
              return `- ${moment.role}${timecode}: ${moment.title} (${moment.sourceName})\n  URL: ${moment.url}\n  Trecho no momento: ${moment.quoteAtMoment ?? "não informado"}\n  Distorção descrita: ${moment.distortionDescription ?? "não informada"}`;
            }).join("\n")
          : "Nenhum momento indexado ainda (prova original / versão viral).";

        const person = input.attributedPerson?.trim() || "a pessoa citada na alegação";
        const quote = input.allegedQuote?.trim() || bundle.caseRecord.claimText;

        const response = await invokeLLM({
          model,
          messages: [
            {
              role: "system",
              content: `Você é analista de checagem especializado em falas atribuídas e trechos fora de contexto.
Missão: ajudar a responder se a pessoa realmente disse o trecho e se ele foi usado fora do contexto original (montagem, corte, omissão do antes/depois).
Regras:
- Nunca invente vídeos, datas, links ou transcrições.
- Se faltar evidência, use "insuficiente" nos campos de avaliação.
- Não emita veredito final nem rótulos absolutos de "fake news".
- Linguagem cautelosa e editorial, em português do Brasil.
- Foque em atribuição da fala, contexto original, o que foi omitido e quais fontes primárias buscar.`,
            },
            {
              role: "user",
              content: `Pergunta do editor: é verdade que ${person} disse o trecho abaixo?\n\nTrecho alegado:\n"""\n${quote}\n"""\n\nAlegação completa do caso:\n${bundle.caseRecord.claimText}\n\nURL de origem do caso: ${bundle.caseRecord.claimUrl || "não informada"}\n\nMomentos indexados:\n${momentContext}\n\nEvidências já registradas:\n${evidenceContext}\n\nProduza o laudo estruturado.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "quote_context_laudo",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  attributedPerson: { type: "string" },
                  allegedQuote: { type: "string" },
                  attributionStatus: { type: "string", enum: ["atribuicao_sustentada", "atribuicao_parcial", "atribuicao_nao_encontrada", "insuficiente"] },
                  contextStatus: { type: "string", enum: ["no_contexto", "fora_de_contexto", "contexto_parcial", "insuficiente"] },
                  originalContextSummary: { type: "string" },
                  omittedOrDistorted: { type: "string" },
                  mediaFramingRisk: { type: "string" },
                  primarySourcesToSeek: { type: "array", items: { type: "string" } },
                  evidenceGaps: { type: "array", items: { type: "string" } },
                  editorialLaudo: { type: "string" },
                },
                required: [
                  "attributedPerson",
                  "allegedQuote",
                  "attributionStatus",
                  "contextStatus",
                  "originalContextSummary",
                  "omittedOrDistorted",
                  "mediaFramingRisk",
                  "primarySourcesToSeek",
                  "evidenceGaps",
                  "editorialLaudo",
                ],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = readLLMText(response.choices?.[0]?.message?.content);
        try {
          return { ...(JSON.parse(raw) as Record<string, unknown>), modelLabel: model };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O modelo retornou um formato que precisa de revisão técnica." });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
