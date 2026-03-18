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
  errorMessage?: string;
};

export type UploadTokenPayload = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  ipHash: string;
  expiresAt: number;
};
