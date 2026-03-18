import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";

import { db } from "./firebaseAdmin.js";
import type { ReportDocument, UserProfile, UserRole } from "./types.js";

export function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "請先登入。");
  }
  return uid;
}

export async function getUserProfile(uid: string): Promise<UserProfile> {
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) {
    throw new HttpsError("permission-denied", "找不到使用者資料。");
  }

  const data = snapshot.data() as UserProfile;
  if (data.disabled) {
    throw new HttpsError("permission-denied", "帳號已停用。");
  }
  return data;
}

export async function requireRole(uid: string, role: UserRole): Promise<UserProfile> {
  const profile = await getUserProfile(uid);
  if (profile.role !== role) {
    throw new HttpsError("permission-denied", "權限不足。");
  }
  return profile;
}

export async function getReportOrThrow(reportId: string): Promise<ReportDocument> {
  const snapshot = await db.collection("reports").doc(reportId).get();
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "找不到報告。");
  }
  return snapshot.data() as ReportDocument;
}

export async function requireReportAccess(uid: string, reportId: string): Promise<ReportDocument> {
  const [profile, report] = await Promise.all([getUserProfile(uid), getReportOrThrow(reportId)]);
  if (profile.role !== "admin" && report.ownerUid !== uid) {
    throw new HttpsError("permission-denied", "無法存取這份報告。");
  }
  return report;
}
