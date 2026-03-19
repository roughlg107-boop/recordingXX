import type { ReportStatus, VisitReportGeneration } from "@/lib/report-schema";

export type ReportActivityRecord = {
  id: string;
  action: "created" | "processing_started" | "completed" | "failed" | "downloaded_docx";
  actorUid?: string;
  actorEmail?: string;
  actorLabel: string;
  createdAt: string;
  detail?: string;
};

export type RecentReportActivityRecord = ReportActivityRecord & {
  reportId: string;
  shopName: string;
  ownerEmail?: string;
};

export type VisitReportRecord = VisitReportGeneration & {
  id: string;
  status: ReportStatus;
  shopName: string;
  salesName: string;
  visitDate: string;
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  processingLeaseExpiresAt?: string;
  errorMessage?: string;
  activityLog: ReportActivityRecord[];
};

export type UploadTokenPayload = {
  uploadSessionId: string;
  sessionHash: string;
  expiresAt: number;
};
