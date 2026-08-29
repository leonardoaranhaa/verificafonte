import { z } from "zod";

export const sourceTypeSchema = z.enum(["text", "link", "print"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const extractionResultSchema = z.object({
  claimText: z.string().min(1),
  entities: z.array(z.string()).default([]),
  datesOrNumbers: z.array(z.string()).default([]),
  suggestedQueries: z.array(z.string()).default([]),
  officialDomainHints: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  editorNotes: z.string().default(""),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const intakeExtractInputSchema = z.object({
  sourceType: sourceTypeSchema,
  text: z.string().optional(),
  url: z.string().url().optional(),
  imageDataUrl: z.string().optional(),
});
export type IntakeExtractInput = z.infer<typeof intakeExtractInputSchema>;

export const caseStatusSchema = z.enum(["draft", "in_review", "published", "rejected"]);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const evidenceStanceSchema = z.enum(["supports", "contradicts", "context", "unrelated"]);
export type EvidenceStance = z.infer<typeof evidenceStanceSchema>;

export const crossCheckCandidateSchema = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string().default(""),
  domain: z.string(),
  isOfficial: z.boolean().default(false),
  publishedAt: z.string().nullable().default(null),
});
export type CrossCheckCandidate = z.infer<typeof crossCheckCandidateSchema>;
