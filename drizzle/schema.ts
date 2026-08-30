import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: text("passwordHash"),
  /**
   * Papel editorial. O padrão `user` é deliberadamente SEM acesso à bancada:
   * o cadastro é aberto, então uma conta recém-criada não pode ler, editar
   * nem publicar casos. Um admin promove a `editor` quem é da redação.
   */
  role: mysqlEnum("role", ["user", "editor", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const factCheckCases = mysqlTable(
  "fact_check_cases",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    claimText: text("claimText").notNull(),
    claimUrl: text("claimUrl"),
    status: mysqlEnum("status", [
      "em_apuracao",
      "confirmado",
      "divergente",
      "insuficiente",
    ]).default("em_apuracao").notNull(),
    workflowStatus: mysqlEnum("workflowStatus", [
      "rascunho",
      "em_revisao",
      "publicado",
      "arquivado",
    ]).default("rascunho").notNull(),
    methodology: text("methodology"),
    editorialNote: text("editorialNote"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    publishedAt: timestamp("publishedAt"),
  },
  table => ({
    workflowIdx: index("fact_check_cases_workflow_idx").on(table.workflowStatus),
    statusIdx: index("fact_check_cases_status_idx").on(table.status),
  }),
);

export const evidences = mysqlTable(
  "evidences",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    sourceName: varchar("sourceName", { length: 240 }).notNull(),
    sourceType: mysqlEnum("sourceType", [
      "oficial",
      "reportagem",
      "documento",
      "outra",
    ]).default("outra").notNull(),
    sourceDate: timestamp("sourceDate"),
    accessedAt: timestamp("accessedAt").defaultNow().notNull(),
    context: text("context").notNull(),
    excerpt: text("excerpt"),
    relation: mysqlEnum("relation", [
      "apoia",
      "contradiz",
      "contextualiza",
      "neutra",
    ]).default("contextualiza").notNull(),
  },
  table => ({
    caseIdx: index("evidences_case_idx").on(table.caseId),
  }),
);

export const caseReviews = mysqlTable(
  "case_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    reviewerId: int("reviewerId").notNull(),
    decision: mysqlEnum("decision", [
      "aprovar",
      "solicitar_ajustes",
      "rejeitar",
    ]).notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    caseIdx: index("case_reviews_case_idx").on(table.caseId),
  }),
);

export const sourceConnections = mysqlTable(
  "source_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 240 }).notNull(),
    endpoint: text("endpoint").notNull(),
    sourceType: mysqlEnum("sourceType", ["oficial", "reportagem", "documento", "outra"]).default("oficial").notNull(),
    accessMode: mysqlEnum("accessMode", ["publico", "credencial"]).default("publico").notNull(),
    status: mysqlEnum("status", ["ativo", "pausado"]).default("ativo").notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    statusIdx: index("source_connections_status_idx").on(table.status),
  }),
);

export const sourceCaseLinks = mysqlTable(
  "source_case_links",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    sourceConnectionId: int("sourceConnectionId").notNull(),
    priority: int("priority").default(0).notNull(),
    active: mysqlEnum("active", ["sim", "nao"]).default("sim").notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    caseIdx: index("source_case_links_case_idx").on(table.caseId),
    sourceIdx: index("source_case_links_source_idx").on(table.sourceConnectionId),
  }),
);

export const researchTasks = mysqlTable(
  "research_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    objective: text("objective").notNull(),
    workerRole: mysqlEnum("workerRole", ["orquestrador", "navegador", "triagem"]).default("navegador").notNull(),
    status: mysqlEnum("status", ["rascunho", "distribuida", "recebida", "cancelada"]).default("rascunho").notNull(),
    resultSummary: text("resultSummary"),
    requestedBy: int("requestedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    caseIdx: index("research_tasks_case_idx").on(table.caseId),
    statusIdx: index("research_tasks_status_idx").on(table.status),
  }),
);

export const historicalFindings = mysqlTable(
  "historical_findings",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    taskId: int("taskId"),
    searchKey: varchar("searchKey", { length: 255 }).notNull(),
    queryText: varchar("queryText", { length: 240 }).notNull(),
    discoveryUrl: text("discoveryUrl").notNull(),
    finalUrl: varchar("finalUrl", { length: 2048 }).notNull(),
    title: text("title").notNull(),
    publisher: varchar("publisher", { length: 240 }).notNull(),
    publishedAt: timestamp("publishedAt"),
    accessedAt: timestamp("accessedAt").defaultNow().notNull(),
    needsEditorialOpen: mysqlEnum("needsEditorialOpen", ["sim", "nao"]).default("sim").notNull(),
    registeredEvidenceId: int("registeredEvidenceId"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    caseIdx: index("historical_findings_case_idx").on(table.caseId),
    taskIdx: index("historical_findings_task_idx").on(table.taskId),
    searchKeyIdx: index("historical_findings_search_key_idx").on(table.searchKey),
  }),
);

export const caseAnalyses = mysqlTable(
  "case_analyses",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    extractedClaim: text("extractedClaim").notNull(),
    evidenceSummary: text("evidenceSummary").notNull(),
    divergences: text("divergences").notNull(),
    reviewBrief: text("reviewBrief").notNull(),
    modelLabel: varchar("modelLabel", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    caseIdx: index("case_analyses_case_idx").on(table.caseId),
  }),
);

/**
 * Momentos indexados: prova original vs versão viral/distorcida.
 * Permite ancorar o instante (vídeo/áudio) e descrever o que a versão viral
 * cortou, omitiu ou refraseou — para o leitor comparar os dois lados.
 */
export const caseSourceMoments = mysqlTable(
  "case_source_moments",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    role: mysqlEnum("role", ["original", "viral_distorcido", "contextual"]).default("original").notNull(),
    mediaKind: mysqlEnum("mediaKind", ["video", "audio", "post", "documento", "outro"]).default("video").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    sourceName: varchar("sourceName", { length: 240 }).notNull(),
    /** Segundo inicial no vídeo/áudio (prova do instante) */
    timestampStartSec: int("timestampStartSec"),
    timestampEndSec: int("timestampEndSec"),
    eventDate: timestamp("eventDate"),
    /** Trecho literal no momento original */
    quoteAtMoment: text("quoteAtMoment"),
    /** O que a versão viral omitiu, cortou ou distorceu */
    distortionDescription: text("distortionDescription"),
    /** Liga a versão distorcida à prova original */
    linkedOriginalMomentId: int("linkedOriginalMomentId"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    caseIdx: index("case_source_moments_case_idx").on(table.caseId),
    roleIdx: index("case_source_moments_role_idx").on(table.role),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FactCheckCase = typeof factCheckCases.$inferSelect;
export type Evidence = typeof evidences.$inferSelect;
export type CaseReview = typeof caseReviews.$inferSelect;
export type CaseAnalysis = typeof caseAnalyses.$inferSelect;
export type CaseSourceMoment = typeof caseSourceMoments.$inferSelect;
export type SourceConnection = typeof sourceConnections.$inferSelect;
export type SourceCaseLink = typeof sourceCaseLinks.$inferSelect;
export type ResearchTask = typeof researchTasks.$inferSelect;
export type HistoricalFinding = typeof historicalFindings.$inferSelect;
