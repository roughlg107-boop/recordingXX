import { z } from "zod";

export const reportStatusSchema = z.enum(["queued", "processing", "completed", "failed"]);

export const visitReportGenerationSchema = z.object({
  summary: z.array(z.string().min(1)).min(3).max(5),
  visitNarrative: z.string().min(1),
  currentMarketingStatus: z.string().min(1),
  needsAndPainPoints: z.array(z.string().min(1)).min(1).max(8),
  goals: z.array(z.string().min(1)).min(1).max(6),
  uncertaintyNotes: z.array(z.string().min(1)).min(0).max(6)
});

export const visitReportInputSchema = z.object({
  shopName: z.string().trim().min(1).max(100),
  salesName: z.string().trim().min(1).max(100),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive(),
  mimeType: z.string().trim().max(120).optional().default("")
});

export const providerValidationSchema = z.object({
  openAiApiKey: z.string().trim().min(1),
  transcriptionModel: z.string().trim().min(1),
  reportModel: z.string().trim().min(1)
});

export const reportSubmissionSchema = z.object({
  shopName: z.string().trim().min(1).max(100),
  salesName: z.string().trim().min(1).max(100),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  uploadToken: z.string().trim().min(1),
  openAiApiKey: z.string().trim().min(1),
  transcriptionModel: z.string().trim().min(1),
  reportModel: z.string().trim().min(1)
});

export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type VisitReportGeneration = z.infer<typeof visitReportGenerationSchema>;
export type VisitReportInput = z.infer<typeof visitReportInputSchema>;
