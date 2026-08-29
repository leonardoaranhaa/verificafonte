import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  caseAnalyses,
  historicalFindings,
  caseReviews,
  researchTasks,
  sourceConnections,
  sourceCaseLinks,
  evidences,
  factCheckCases,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listCases() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(factCheckCases).orderBy(desc(factCheckCases.updatedAt));
}

export async function listPublishedCases() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(factCheckCases)
    .where(eq(factCheckCases.workflowStatus, "publicado"))
    .orderBy(desc(factCheckCases.publishedAt));
}

export async function getCaseById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(factCheckCases).where(eq(factCheckCases.id, id)).limit(1);
  return result[0];
}

export async function getPublishedCaseBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(factCheckCases)
    .where(and(eq(factCheckCases.slug, slug), eq(factCheckCases.workflowStatus, "publicado")))
    .limit(1);
  return result[0];
}

export async function getCaseBundle(caseId: number) {
  const db = await getDb();
  if (!db) return { caseRecord: undefined, evidenceRows: [], reviewRows: [], analysisRows: [] };
  const [caseRows, evidenceRows, reviewRows, analysisRows] = await Promise.all([
    db.select().from(factCheckCases).where(eq(factCheckCases.id, caseId)).limit(1),
    db.select().from(evidences).where(eq(evidences.caseId, caseId)).orderBy(desc(evidences.accessedAt)),
    db.select().from(caseReviews).where(eq(caseReviews.caseId, caseId)).orderBy(desc(caseReviews.createdAt)),
    db.select().from(caseAnalyses).where(eq(caseAnalyses.caseId, caseId)).orderBy(desc(caseAnalyses.createdAt)),
  ]);
  return { caseRecord: caseRows[0], evidenceRows, reviewRows, analysisRows };
}

export async function getPublishedBundle(slug: string) {
  const db = await getDb();
  if (!db) return { caseRecord: undefined, evidenceRows: [], reviewRows: [], analysisRows: [] };
  const caseRows = await db
    .select()
    .from(factCheckCases)
    .where(and(eq(factCheckCases.slug, slug), eq(factCheckCases.workflowStatus, "publicado")))
    .limit(1);
  const caseRecord = caseRows[0];
  if (!caseRecord) return { caseRecord: undefined, evidenceRows: [], reviewRows: [], analysisRows: [] };
  const [evidenceRows, reviewRows, analysisRows] = await Promise.all([
    db.select().from(evidences).where(eq(evidences.caseId, caseRecord.id)).orderBy(desc(evidences.accessedAt)),
    db.select().from(caseReviews).where(eq(caseReviews.caseId, caseRecord.id)).orderBy(desc(caseReviews.createdAt)),
    db.select().from(caseAnalyses).where(eq(caseAnalyses.caseId, caseRecord.id)).orderBy(desc(caseAnalyses.createdAt)),
  ]);
  return { caseRecord, evidenceRows, reviewRows, analysisRows };
}

export async function getCaseStats() {
  const db = await getDb();
  if (!db) return { total: 0, inReview: 0, published: 0, evidenceCount: 0 };
  const [caseRows, evidenceRows] = await Promise.all([
    db
      .select({ workflowStatus: factCheckCases.workflowStatus, count: sql<number>`count(*)` })
      .from(factCheckCases)
      .groupBy(factCheckCases.workflowStatus),
    db.select({ count: sql<number>`count(*)` }).from(evidences),
  ]);
  const countFor = (status: string) => Number(caseRows.find(row => row.workflowStatus === status)?.count ?? 0);
  return {
    total: caseRows.reduce((sum, row) => sum + Number(row.count), 0),
    inReview: countFor("em_revisao"),
    published: countFor("publicado"),
    evidenceCount: Number(evidenceRows[0]?.count ?? 0),
  };
}

export async function createCase(input: {
  slug: string;
  claimText: string;
  claimUrl?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(factCheckCases).values(input);
  return getCaseById(Number(result[0].insertId));
}

export async function updateCaseWorkflow(input: {
  caseId: number;
  workflowStatus: "rascunho" | "em_revisao" | "publicado" | "arquivado";
  status?: "em_apuracao" | "confirmado" | "divergente" | "insuficiente";
  methodology?: string;
  editorialNote?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db
    .update(factCheckCases)
    .set({
      workflowStatus: input.workflowStatus,
      status: input.status,
      methodology: input.methodology,
      editorialNote: input.editorialNote,
      publishedAt: input.workflowStatus === "publicado" ? new Date() : undefined,
    })
    .where(eq(factCheckCases.id, input.caseId));
  return getCaseById(input.caseId);
}

export async function addEvidence(input: {
  caseId: number;
  title: string;
  url: string;
  sourceName: string;
  sourceType: "oficial" | "reportagem" | "documento" | "outra";
  sourceDate?: Date;
  context: string;
  excerpt?: string;
  relation: "apoia" | "contradiz" | "contextualiza" | "neutra";
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(evidences).values(input);
  const rows = await db.select().from(evidences).where(eq(evidences.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}

export async function addReview(input: {
  caseId: number;
  reviewerId: number;
  decision: "aprovar" | "solicitar_ajustes" | "rejeitar";
  note: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(caseReviews).values(input);
  const rows = await db.select().from(caseReviews).where(eq(caseReviews.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}

export async function listSourceConnections() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourceConnections).orderBy(desc(sourceConnections.updatedAt));
}

export async function listCaseSourceLinks(caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ link: sourceCaseLinks, source: sourceConnections }).from(sourceCaseLinks).innerJoin(sourceConnections, eq(sourceCaseLinks.sourceConnectionId, sourceConnections.id)).where(eq(sourceCaseLinks.caseId, caseId)).orderBy(desc(sourceCaseLinks.priority));
}

export async function linkSourceToCase(input: { caseId: number; sourceConnectionId: number; priority: number; active: "sim" | "nao"; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(sourceCaseLinks).values(input);
  const rows = await db.select().from(sourceCaseLinks).where(eq(sourceCaseLinks.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}

export async function setSourceConnectionStatus(id: number, status: "ativo" | "pausado") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(sourceConnections).set({ status }).where(eq(sourceConnections.id, id));
  const rows = await db.select().from(sourceConnections).where(eq(sourceConnections.id, id)).limit(1);
  return rows[0];
}

export async function createSourceConnection(input: {
  name: string;
  endpoint: string;
  sourceType: "oficial" | "reportagem" | "documento" | "outra";
  accessMode: "publico" | "credencial";
  notes?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(sourceConnections).values(input);
  const rows = await db.select().from(sourceConnections).where(eq(sourceConnections.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}

export async function listResearchTasks(caseId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(researchTasks);
  return caseId ? query.where(eq(researchTasks.caseId, caseId)).orderBy(desc(researchTasks.updatedAt)) : query.orderBy(desc(researchTasks.updatedAt));
}

export async function createResearchTask(input: {
  caseId: number;
  objective: string;
  workerRole: "orquestrador" | "navegador" | "triagem";
  requestedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(researchTasks).values(input);
  const rows = await db.select().from(researchTasks).where(eq(researchTasks.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}

export async function listHistoricalFindings(caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(historicalFindings).where(eq(historicalFindings.caseId, caseId)).orderBy(desc(historicalFindings.accessedAt));
}

export async function createHistoricalFindings(input: Array<{
  caseId: number;
  taskId?: number;
  searchKey: string;
  queryText: string;
  discoveryUrl: string;
  finalUrl: string;
  title: string;
  publisher: string;
  publishedAt?: Date;
  accessedAt?: Date;
  needsEditorialOpen: "sim" | "nao";
  createdBy: number;
}>) {
  const db = await getDb();
  if (!db || input.length === 0) return [];
  await db.insert(historicalFindings).values(input);
  return listHistoricalFindings(input[0].caseId);
}

export async function markHistoricalFindingEvidence(findingId: number, evidenceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(historicalFindings).set({ registeredEvidenceId: evidenceId, needsEditorialOpen: "nao" }).where(eq(historicalFindings.id, findingId));
  const rows = await db.select().from(historicalFindings).where(eq(historicalFindings.id, findingId)).limit(1);
  return rows[0];
}

export async function saveAnalysis(input: {
  caseId: number;
  extractedClaim: string;
  evidenceSummary: string;
  divergences: string;
  reviewBrief: string;
  modelLabel?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(caseAnalyses).values(input);
  const rows = await db.select().from(caseAnalyses).where(eq(caseAnalyses.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}
