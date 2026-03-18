import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { REPORT_COLLECTION, REPORT_RETENTION_HOURS, REPORT_STALE_AFTER_MS } from "@/lib/constants";
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
  ipHash?: string;
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
  ipHash: string;
}) {
  const db = getDb();
  const ref = db.collection(REPORT_COLLECTION).doc(input.id);
  const expiresAt = getExpiryTimestamp();

  await ref.set({
    status: "queued",
    shopName: input.shopName,
    salesName: input.salesName,
    visitDate: input.visitDate,
    ipHash: input.ipHash,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt
  });
}

export async function markReportProcessing(id: string) {
  const ref = getDb().collection(REPORT_COLLECTION).doc(id);
  await ref.set(
    {
      status: "processing",
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
      summary: report.summary,
      visitNarrative: report.visitNarrative,
      currentMarketingStatus: report.currentMarketingStatus,
      needsAndPainPoints: report.needsAndPainPoints,
      goals: report.goals,
      uncertaintyNotes: report.uncertaintyNotes,
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

  const updatedAt = data.updatedAt.toDate().getTime();
  if (
    (data.status === "queued" || data.status === "processing") &&
    Date.now() - updatedAt > REPORT_STALE_AFTER_MS
  ) {
    await failReport(id, "處理逾時，請重新上傳錄音。");
    const refreshed = await getDb().collection(REPORT_COLLECTION).doc(id).get();
    return serializeReport(refreshed.id, refreshed.data() as StoredReport);
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
