import type { ReportStatus, VisitReportGeneration } from "@/lib/report-schema";

export type VisitReportRecord = VisitReportGeneration & {
  id: string;
  status: ReportStatus;
  shopName: string;
  salesName: string;
  visitDate: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  processingLeaseExpiresAt?: string;
  errorMessage?: string;
};

export type UploadTokenPayload = {
  uploadSessionId: string;
  sessionHash: string;
  expiresAt: number;
};
