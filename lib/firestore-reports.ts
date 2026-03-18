import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { REPORT_COLLECTION, REPORT_RETENTION_HOURS } from "@/lib/constants";
import { getDb } from "@/lib/firebase-admin";
import { AppError } from "@/lib/errors";
import type { VisitReportGeneration } from "@/lib/report-schema";
import type { VisitReportRecord } from "@/lib/types";

type StoredReport = {
  status: "queued" | "processing" | "completed" | "failed";
  shopName: string;
  salesName: string;
  visitDate: string;
  summary?: string[];
  visitNarrative?: string;
  currentMarketingStatus?: string;
  needsAndPainPoints?: string[];
  goals?: string[];
  uncertaintyNotes?: string[];
  errorMessage?: string;
  sessionHash?: string;
  objectPath?: string;
  originalFileName?: string;
  originalMimeType?: string;
  originalFileSize?: number;
  processingAttempts?: number;
  processingLeaseExpiresAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
};

export type ReportProcessingClaim = {
  reportId: string;
  sessionHash: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  objectPath: string;
  fileName: string;
  mimeType: string;
};

function serializeReport(id: string, data: StoredReport): VisitReportRecord {
  return {
    id,
    status: data.status,
    shopName: data.shopName,
    salesName: data.salesName,
    visitDate: data.visitDate,
    summary: data.summary || [],
    visitNarrative: data.visitNarrative || "",
    currentMarketingStatus: data.currentMarketingStatus || "",
    needsAndPainPoints: data.needsAndPainPoints || [],
    goals: data.goals || [],
    uncertaintyNotes: data.uncertaintyNotes || [],
    createdAt: data.createdAt.toDate().toISOString(),
    updatedAt: data.updatedAt.toDate().toISOString(),
    expiresAt: data.expiresAt.toDate().toISOString(),
    processingLeaseExpiresAt: data.processingLeaseExpiresAt?.toDate().toISOString(),
    errorMessage: data.errorMessage
  };
}

function getExpiryTimestamp() {
  return Timestamp.fromDate(new Date(Date.now() + REPORT_RETENTION_HOURS * 60 * 60 * 1000));
}

export async function createQueuedReport(input: {
  id: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  sessionHash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  const db = getDb();
  const ref = db.collection(REPORT_COLLECTION).doc(input.id);
  const expiresAt = getExpiryTimestamp();

  await ref.set({
    status: "queued",
    shopName: input.shopName,
    salesName: input.salesName,
    visitDate: input.visitDate,
    sessionHash: input.sessionHash,
    originalFileName: input.fileName,
    originalMimeType: input.mimeType,
    originalFileSize: input.fileSize,
    processingAttempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt
  });
}

export async function attachReportAudio(id: string, objectPath: string) {
  const ref = getDb().collection(REPORT_COLLECTION).doc(id);
  await ref.set(
    {
      objectPath,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export async function claimReportForProcessing(
  id: string,
  sessionHash: string,
  processingLeaseMs: number
) {
  const db = getDb();
  const ref = db.collection(REPORT_COLLECTION).doc(id);
  const now = Date.now();
  let claim: ReportProcessingClaim | null = null;
  let missing = false;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      missing = true;
      return;
    }

    const data = snapshot.data() as StoredReport;

    if (data.expiresAt.toDate().getTime() <= now) {
      return;
    }

    if (data.sessionHash !== sessionHash) {
      throw new AppError("這份報告不屬於目前的瀏覽器工作階段。", 403, "report_session_mismatch");
    }

    if (!data.objectPath || !data.originalFileName) {
      throw new AppError("錄音檔尚未準備完成，請稍後再試。", 409, "audio_not_ready");
    }

    if (data.status === "completed" || data.status === "failed") {
      return;
    }

    const leaseExpired = !data.processingLeaseExpiresAt || data.processingLeaseExpiresAt.toDate().getTime() <= now;

    if (data.status === "processing" && !leaseExpired) {
      return;
    }

    transaction.set(
      ref,
      {
        status: "processing",
        errorMessage: FieldValue.delete(),
        processingAttempts: FieldValue.increment(1),
        processingLeaseExpiresAt: Timestamp.fromMillis(now + processingLeaseMs),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    claim = {
      reportId: snapshot.id,
      sessionHash,
      shopName: data.shopName,
      salesName: data.salesName,
      visitDate: data.visitDate,
      objectPath: data.objectPath,
      fileName: data.originalFileName,
      mimeType: data.originalMimeType || "application/octet-stream"
    };
  });

  if (missing) {
    throw new AppError("找不到這份報告，可能已到期。", 404, "report_not_found");
  }

  return claim;
}

export async function heartbeatReportProcessing(id: string, processingLeaseMs: number) {
  const ref = getDb().collection(REPORT_COLLECTION).doc(id);
  await ref.set(
    {
      processingLeaseExpiresAt: Timestamp.fromMillis(Date.now() + processingLeaseMs),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export async function completeReport(id: string, report: VisitReportGeneration) {
  const ref = getDb().collection(REPORT_COLLECTION).doc(id);
  await ref.set(
    {
      status: "completed",
      errorMessage: FieldValue.delete(),
      summary: report.summary,
      visitNarrative: report.visitNarrative,
      currentMarketingStatus: report.currentMarketingStatus,
      needsAndPainPoints: report.needsAndPainPoints,
      goals: report.goals,
      uncertaintyNotes: report.uncertaintyNotes,
      processingLeaseExpiresAt: FieldValue.delete(),
      objectPath: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export async function failReport(id: string, errorMessage: string) {
  const ref = getDb().collection(REPORT_COLLECTION).doc(id);
  await ref.set(
    {
      status: "failed",
      errorMessage,
      processingLeaseExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export async function getReport(id: string) {
  const snapshot = await getDb().collection(REPORT_COLLECTION).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as StoredReport;
  if (data.expiresAt.toDate().getTime() <= Date.now()) {
    return null;
  }

  return serializeReport(snapshot.id, data);
}

export async function getReportStatus(id: string) {
  const snapshot = await getDb().collection(REPORT_COLLECTION).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as StoredReport;
  if (data.expiresAt.toDate().getTime() <= Date.now()) {
    return null;
  }

  return serializeReport(snapshot.id, data);
}

export async function assertReportExists(id: string) {
  const report = await getReport(id);
  if (!report) {
    throw new AppError("找不到這份報告，可能已到期。", 404, "report_not_found");
  }

  return report;
}
