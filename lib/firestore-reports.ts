import { randomUUID } from "crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { REPORT_COLLECTION, REPORT_RETENTION_HOURS } from "@/lib/constants";
import { getDb } from "@/lib/firebase-admin";
import { AppError } from "@/lib/errors";
import type { VisitReportGeneration } from "@/lib/report-schema";
import type { RecentReportActivityRecord, ReportActivityRecord, VisitReportRecord } from "@/lib/types";

type StoredReport = {
  status: "queued" | "processing" | "completed" | "failed";
  ownerUid?: string;
  ownerEmail?: string;
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
  activityLog?: ReportActivityRecord[];
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

type ReportAccessContext = {
  sessionHash?: string;
  ownerUid?: string;
};

function serializeReport(id: string, data: StoredReport): VisitReportRecord {
  return {
    id,
    status: data.status,
    shopName: data.shopName,
    salesName: data.salesName,
    visitDate: data.visitDate,
    ownerEmail: data.ownerEmail,
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
    errorMessage: data.errorMessage,
    activityLog: (data.activityLog || []).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  };
}

function getExpiryTimestamp() {
  return Timestamp.fromDate(new Date(Date.now() + REPORT_RETENTION_HOURS * 60 * 60 * 1000));
}

function createActivityRecord(input: {
  action: ReportActivityRecord["action"];
  actorUid?: string;
  actorEmail?: string;
  actorLabel: string;
  detail?: string;
}) {
  return {
    id: randomUUID(),
    action: input.action,
    actorLabel: input.actorLabel,
    createdAt: new Date().toISOString(),
    ...(input.actorUid ? { actorUid: input.actorUid } : {}),
    ...(input.actorEmail ? { actorEmail: input.actorEmail } : {}),
    ...(input.detail ? { detail: input.detail } : {})
  } satisfies ReportActivityRecord;
}

function assertReportAccess(data: StoredReport, access?: ReportAccessContext) {
  if (!access) {
    return;
  }

  if (data.ownerUid && access.ownerUid && data.ownerUid !== access.ownerUid) {
    throw new AppError("這份報告不屬於目前登入帳號。", 403, "report_owner_mismatch");
  }

  if (data.ownerUid && !access.ownerUid) {
    throw new AppError("請先登入後再查看報告。", 401, "auth_required");
  }

  if (access.sessionHash && data.sessionHash && data.sessionHash !== access.sessionHash) {
    throw new AppError("這份報告不屬於目前的瀏覽器工作階段。", 403, "report_session_mismatch");
  }
}

export async function createQueuedReport(input: {
  id: string;
  ownerUid: string;
  ownerEmail?: string;
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
      ownerUid: input.ownerUid,
      ownerEmail: input.ownerEmail || input.ownerUid,
      shopName: input.shopName,
      salesName: input.salesName,
      visitDate: input.visitDate,
    sessionHash: input.sessionHash,
    originalFileName: input.fileName,
    originalMimeType: input.mimeType,
      originalFileSize: input.fileSize,
      processingAttempts: 0,
      activityLog: [
        createActivityRecord({
          action: "created",
          actorUid: input.ownerUid,
          actorEmail: input.ownerEmail,
          actorLabel: input.ownerEmail || input.ownerUid,
          detail: "建立報告"
        })
      ],
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
  access: ReportAccessContext,
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

    assertReportAccess(data, access);

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
      sessionHash: access.sessionHash || "",
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
      activityLog: FieldValue.arrayUnion(
        createActivityRecord({
          action: "completed",
          actorLabel: "系統",
          detail: "完成報告整理"
        })
      ),
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
      activityLog: FieldValue.arrayUnion(
        createActivityRecord({
          action: "failed",
          actorLabel: "系統",
          detail: errorMessage
        })
      ),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export async function appendReportActivity(
  id: string,
  activity: {
    action: ReportActivityRecord["action"];
    actorUid?: string;
    actorEmail?: string;
    actorLabel: string;
    detail?: string;
  }
) {
  const ref = getDb().collection(REPORT_COLLECTION).doc(id);
  await ref.set(
    {
      activityLog: FieldValue.arrayUnion(createActivityRecord(activity)),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export async function listRecentReportActivities(limit = 30) {
  const queryLimit = Math.max(limit, 12);
  const snapshot = await getDb()
    .collection(REPORT_COLLECTION)
    .orderBy("updatedAt", "desc")
    .limit(queryLimit)
    .get();

  const activities = snapshot.docs.flatMap((document) => {
    const data = document.data() as StoredReport;

    return (data.activityLog || []).map(
      (activity) =>
        ({
          ...activity,
          reportId: document.id,
          shopName: data.shopName,
          ownerEmail: data.ownerEmail
        }) satisfies RecentReportActivityRecord
    );
  });

  return activities
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function getReport(id: string, access?: ReportAccessContext) {
  const snapshot = await getDb().collection(REPORT_COLLECTION).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as StoredReport;
  if (data.expiresAt.toDate().getTime() <= Date.now()) {
    return null;
  }

  assertReportAccess(data, access);

  return serializeReport(snapshot.id, data);
}

export async function getReportStatus(id: string, access?: ReportAccessContext) {
  const snapshot = await getDb().collection(REPORT_COLLECTION).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as StoredReport;
  if (data.expiresAt.toDate().getTime() <= Date.now()) {
    return null;
  }

  assertReportAccess(data, access);

  return serializeReport(snapshot.id, data);
}

export async function assertReportExists(id: string, access?: ReportAccessContext) {
  const report = await getReport(id, access);
  if (!report) {
    throw new AppError("找不到這份報告，可能已到期。", 404, "report_not_found");
  }

  return report;
}
