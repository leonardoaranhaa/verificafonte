import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createSessionToken } from "./_core/auth";
import { extractClaimFromImage, extractClaimFromUrl } from "./_core/intake";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { emailOpenId, hashPassword, normalizeEmail, verifyPassword } from "./_core/password";
import {
  addEvidence,
  addReview,
  createCase,
  createResearchTask,
  createHistoricalFindings,
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
  setSourceConnectionStatus,
  saveAnalysis,
  updateCaseWorkflow,
  upsertUser,
} from "./db";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

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

export const reviewInputSchema = z.object({
  caseId: z.number().int().positive(),
  decision: z.enum(["aprovar", "solicitar_ajustes", "rejeitar"]),
  note: z.string().trim().min(10).max(10000),
});

export function assertPublishable(input: { workflowStatus: z.infer<typeof workflowSchema>; methodology?: string | null; editorialNote?: string | null }, hasApprovedReview: boolean) {
  if (input.workflowStatus !== "publicado") return;
  if (!input.methodology?.trim() || !input.editorialNote?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Preencha a metodologia e a justificativa pública antes de publicar este caso." });
  }
  if (!hasApprovedReview) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Registre uma revisão humana aprovada antes de publicar este caso." });
  }
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

function isPublicHttps(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  return url.protocol === "https:" && hostname !== "localhost" && hostname !== "::1" && !hostname.startsWith("127.") && !hostname.startsWith("10.") && !hostname.startsWith("192.168.") && !/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) && !hostname.startsWith("169.254.");
}

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
    const response = await fetch(value, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(6000), headers: { accept: "text/html,application/xhtml+xml" } });
    await response.body?.cancel();
    return isPublicHttps(response.url) ? canonicalizeUrl(response.url) : canonicalizeUrl(value);
  } catch {
    return canonicalizeUrl(value);
  }
}

function readLLMText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(item => (typeof item === "object" && item && "text" in item ? String(item.text) : "")).join("");
  }
  return "";
}

export const appRouter = router({
  system: router({
    health: publicProcedure.query(() => ({ ok: true })),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure.input(registerInputSchema).mutation(async ({ input, ctx }) => {
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
      return user;
    }),
    login: publicProcedure.input(loginInputSchema).mutation(async ({ input, ctx }) => {
      const openId = emailOpenId(input.email);
      const user = await getUserByOpenId(openId);
      if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
      }
      await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const token = await createSessionToken({ openId: user.openId, name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  intake: router({
    extractFromUrl: protectedProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input }) => {
        try {
          return await extractClaimFromUrl(input.url);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível extrair a alegação deste link." });
        }
      }),
    extractFromImage: protectedProcedure
      .input(z.object({ imageDataUrl: z.string().min(1) }))
      .mutation(async ({ input }) => {
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
    workspace: protectedProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input }) => getCaseBundle(input.caseId)),
    all: protectedProcedure.query(() => listCases()),
    create: protectedProcedure
      .input(claimInputSchema)
      .mutation(async ({ input, ctx }) => {
        const base = input.claimText.toLowerCase().replace(/[^a-z0-9à-ú]+/gi, "-").replace(/(^-|-$)/g, "").slice(0, 110);
        return createCase({
          slug: `${base || "caso"}-${nanoid(7).toLowerCase()}`,
          claimText: input.claimText.trim(),
          claimUrl: cleanOptional(input.claimUrl),
          createdBy: ctx.user.id,
        });
      }),
    updateWorkflow: protectedProcedure
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
          const approvedReview = bundle.reviewRows.some(review => review.decision === "aprovar");
          assertPublishable(input, approvedReview);
        }
        return updateCaseWorkflow(input);
      }),
  }),
  evidences: router({
    add: protectedProcedure
      .input(evidenceInputSchema)
      .mutation(({ input }) => addEvidence({
        ...input,
        sourceDate: input.sourceDate ? new Date(input.sourceDate) : undefined,
        excerpt: cleanOptional(input.excerpt),
      })),
  }),
  reviews: router({
    submit: protectedProcedure
      .input(reviewInputSchema)
      .mutation(({ input, ctx }) => addReview({ ...input, reviewerId: ctx.user.id })),
  }),
  sources: router({
    list: protectedProcedure.query(() => listSourceConnections()),
    create: protectedProcedure.input(sourceConnectionInputSchema).mutation(({ input, ctx }) => createSourceConnection({ ...input, notes: cleanOptional(input.notes), createdBy: ctx.user.id })),
    setStatus: protectedProcedure.input(sourceStatusInputSchema).mutation(({ input }) => setSourceConnectionStatus(input.id, input.status)),
    forCase: protectedProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input }) => listCaseSourceLinks(input.caseId)),
    linkToCase: protectedProcedure.input(sourceCaseLinkInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      return linkSourceToCase({ ...input, createdBy: ctx.user.id });
    }),
    ingest: protectedProcedure.input(sourceIngestInputSchema).mutation(async ({ input }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const url = new URL(input.endpoint);
      const hostname = url.hostname.toLowerCase();
      const isPrivate = url.protocol !== "https:" || hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.") || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(hostname) || hostname.startsWith("169.254.");
      if (isPrivate) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas endpoints HTTPS públicos podem ser ingeridos." });
      try {
        const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
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
    probe: protectedProcedure.input(sourceProbeInputSchema).mutation(async ({ input }) => {
      const url = new URL(input.endpoint);
      const hostname = url.hostname.toLowerCase();
      const isPrivate = url.protocol !== "https:" || hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.") || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(hostname) || hostname.startsWith("169.254.");
      if (isPrivate) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas endpoints HTTPS públicos podem ser testados." });
      try {
        const response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
        return { ok: response.ok, status: response.status, contentType: response.headers.get("content-type") ?? "não informado", retrievedAt: new Date().toISOString() };
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível consultar este endpoint público agora." });
      }
    }),
  }),
  research: router({
    list: protectedProcedure.input(z.object({ caseId: z.number().int().positive().optional() }).optional()).query(({ input }) => listResearchTasks(input?.caseId)),
    create: protectedProcedure.input(researchTaskInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      return createResearchTask({ ...input, requestedBy: ctx.user.id });
    }),
    findings: protectedProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input }) => listHistoricalFindings(input.caseId)),
    discover: protectedProcedure.input(historicalSearchInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const start = toGdeltDate(input.startDate);
      const end = toGdeltDate(input.endDate, true);
      if (start > end) throw new TRPCError({ code: "BAD_REQUEST", message: "A data inicial deve ser anterior à data final." });
      const maxWindowMs = 366 * 24 * 60 * 60 * 1000;
      if (end.getTime() - start.getTime() > maxWindowMs) throw new TRPCError({ code: "BAD_REQUEST", message: "A janela histórica máxima nesta busca é de 366 dias." });
      const task = await createResearchTask({ caseId: input.caseId, objective: `Descobrir cobertura histórica para: ${input.query} (${input.startDate} a ${input.endDate})`, workerRole: "navegador", requestedBy: ctx.user.id });
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
        const searchKey = `${input.caseId}:${input.query.trim().toLowerCase()}:${input.startDate}:${input.endDate}`;
        const persisted = await createHistoricalFindings(results.map(item => ({ caseId: input.caseId, taskId: task?.id, searchKey, queryText: input.query, discoveryUrl: item.discoveryUrl, finalUrl: item.url, title: item.title, publisher: item.publisher, publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined, accessedAt: new Date(item.accessedAt), needsEditorialOpen: "sim" as const, createdBy: ctx.user.id })));
        const resultsWithIds = results.map((item, index) => ({ ...item, findingId: persisted[index]?.id ?? null }));
        return { task, query: input.query, startDate: input.startDate, endDate: input.endDate, provider: "Google Notícias RSS", results: resultsWithIds, persisted };
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A busca histórica não conseguiu consultar o índice público agora." });
      }
    }),
    simulateReturn: protectedProcedure.input(agentSimulationInputSchema).mutation(async ({ input, ctx }) => {
      const bundle = await getCaseBundle(input.caseId);
      if (!bundle.caseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Caso não encontrado" });
      const task = await createResearchTask({ caseId: input.caseId, objective: input.objective, workerRole: "navegador", requestedBy: ctx.user.id });
      const url = new URL(input.endpoint);
      const hostname = url.hostname.toLowerCase();
      const isPrivate = url.protocol !== "https:" || hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.") || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(hostname) || hostname.startsWith("169.254.");
      if (isPrivate) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas endpoints HTTPS públicos podem ser consultados." });
      try {
        const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
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
    recordFinding: protectedProcedure.input(evidenceInputSchema.extend({ taskId: z.number().int().positive().optional(), findingId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
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
  analysis: router({
    generate: protectedProcedure
      .input(z.object({ caseId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
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
  }),
});

export type AppRouter = typeof appRouter;
