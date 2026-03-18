import { Timestamp, type DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { auth, firebaseApp, functions, functionsRegion } from "./firebase";
import {
  createDefaultAiSettings,
  createEmptyManualFields,
  type AiSettingsPayload,
  type ManualFields,
  type ReportRecord,
  type UncertainItem,
} from "./types";

const MAX_DIRECT_UPLOAD_BYTES = 28 * 1024 * 1024;

function timestampToDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return null;
}

function getHttpFunctionUrl(name: string): string {
  const projectId = firebaseApp.options.projectId;
  if (!projectId) {
    throw new Error("找不到 Firebase projectId。");
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `http://127.0.0.1:5001/${projectId}/${functionsRegion}/${name}`;
  }

  return `https://${functionsRegion}-${projectId}.cloudfunctions.net/${name}`;
}

async function getAuthHeader(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("請先登入後再操作。");
  }
  const idToken = await user.getIdToken();
  return `Bearer ${idToken}`;
}

async function markReportUploadFailed(reportId: string, message: string): Promise<void> {
  const callable = httpsCallable<{ reportId: string; message: string }, { ok: boolean }>(
    functions,
    "markReportUploadFailed",
  );
  await callable({ reportId, message });
}

function triggerFileDownload(fileName: string, base64Content: string): void {
  const bytes = Uint8Array.from(atob(base64Content), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function normalizeReport(id: string, data: DocumentData): ReportRecord {
  return {
    id,
    ownerUid: String(data.ownerUid ?? ""),
    ownerEmail: String(data.ownerEmail ?? ""),
    ownerName: String(data.ownerName ?? ""),
    providerSnapshot: {
      provider: data.providerSnapshot?.provider === "gemini" ? "gemini" : "openai",
      transcriptModel: String(data.providerSnapshot?.transcriptModel ?? ""),
      summaryModel: String(data.providerSnapshot?.summaryModel ?? ""),
    },
    companyNameNormalized: String(data.companyNameNormalized ?? ""),
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    expiresAt: timestampToDate(data.expiresAt),
    processingStatus: data.processingStatus ?? "queued",
    statusDetail: String(data.statusDetail ?? ""),
    errorMessage: data.errorMessage ? String(data.errorMessage) : null,
    audioUpload: data.audioUpload ?? null,
    interviewRecordAiText: String(data.interviewRecordAiText ?? ""),
    uncertainItems: Array.isArray(data.uncertainItems) ? data.uncertainItems : [],
    transcript: data.transcript ?? null,
    manualFields: {
      ...createEmptyManualFields(),
      ...(data.manualFields ?? {}),
    },
    exportArtifact: data.exportArtifact
      ? {
          ...data.exportArtifact,
          generatedAt: timestampToDate(data.exportArtifact.generatedAt),
        }
      : null,
    regenerateCount: Number(data.regenerateCount ?? 0),
    usageMetrics: data.usageMetrics ?? {
      durationSeconds: 0,
      estimatedCostUsd: 0,
      transcriptionCostUsd: 0,
      summaryCostUsd: 0,
      transcriptionInputTokens: 0,
      transcriptionOutputTokens: 0,
      summaryInputTokens: 0,
      summaryOutputTokens: 0,
    },
  };
}

export async function createAndUploadReport(file: File): Promise<string> {
  if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new Error("目前已取消 Firebase Storage，單檔請控制在 28MB 內。");
  }

  const createDraft = httpsCallable<
    { fileName: string; contentType: string; size: number },
    { reportId: string }
  >(functions, "createReportDraft");
  const result = await createDraft({
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });

  const reportId = result.data.reportId;
  void uploadReportAudio(reportId, file).catch(async (error) => {
    const message = error instanceof Error ? error.message : "錄音上傳失敗";
    await markReportUploadFailed(reportId, message).catch(() => undefined);
  });

  return reportId;
}

async function uploadReportAudio(reportId: string, file: File): Promise<void> {
  const authHeader = await getAuthHeader();
  const formData = new FormData();
  formData.append("reportId", reportId);
  formData.append("file", file, file.name);

  const response = await fetch(getHttpFunctionUrl("processUploadedAudio"), {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: formData,
  });

  if (response.ok) {
    return;
  }

  let message = "錄音處理失敗";
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      message = payload.error;
    }
  } catch {
    // Ignore non-JSON error bodies.
  }

  throw new Error(message);
}

export async function saveManualFields(reportId: string, manualFields: ManualFields): Promise<void> {
  const callable = httpsCallable<{ reportId: string; manualFields: ManualFields }, { ok: boolean }>(
    functions,
    "saveReportManualFields",
  );
  await callable({ reportId, manualFields });
}

export async function updateUncertainItems(reportId: string, uncertainItems: UncertainItem[]): Promise<void> {
  const callable = httpsCallable<
    { reportId: string; uncertainItems: UncertainItem[] },
    { ok: boolean }
  >(functions, "updateReportUncertainItems");
  await callable({ reportId, uncertainItems });
}

export async function regenerateInterviewRecord(reportId: string): Promise<void> {
  const callable = httpsCallable<{ reportId: string }, { ok: boolean }>(
    functions,
    "regenerateInterviewRecord",
  );
  await callable({ reportId });
}

export async function exportWordReport(options: {
  reportId: string;
  manualFields: ManualFields;
  uncertainItems: UncertainItem[];
}): Promise<{ fileName: string }> {
  const callable = httpsCallable<
    { reportId: string; manualFields: ManualFields; uncertainItems: UncertainItem[] },
    { ok: boolean; fileName: string; base64Content: string }
  >(functions, "exportReportDocx");
  const result = await callable(options);
  triggerFileDownload(result.data.fileName, result.data.base64Content);
  return {
    fileName: result.data.fileName,
  };
}

export async function adminCreateUserAccount(input: {
  email: string;
  password: string;
  displayName: string;
  role: "sales" | "admin";
}): Promise<void> {
  const callable = httpsCallable<typeof input, { uid: string }>(functions, "adminCreateUser");
  await callable(input);
}

export async function adminSetUserDisabled(input: {
  uid: string;
  disabled: boolean;
}): Promise<void> {
  const callable = httpsCallable<typeof input, { ok: boolean }>(functions, "adminSetUserDisabled");
  await callable(input);
}

export async function adminSetTemporaryPassword(input: {
  uid: string;
  password: string;
}): Promise<void> {
  const callable = httpsCallable<typeof input, { ok: boolean }>(
    functions,
    "adminSetTemporaryPassword",
  );
  await callable(input);
}

export async function getAiSettings(): Promise<AiSettingsPayload> {
  const callable = httpsCallable<undefined, AiSettingsPayload>(functions, "getAiSettings");
  const result = await callable();
  return {
    ...createDefaultAiSettings(),
    ...result.data,
  };
}

export async function saveAiProviderSettings(
  input: AiSettingsPayload,
): Promise<AiSettingsPayload> {
  const callable = httpsCallable<AiSettingsPayload, AiSettingsPayload>(
    functions,
    "saveAiProviderSettings",
  );
  const result = await callable(input);
  return {
    ...createDefaultAiSettings(),
    ...result.data,
  };
}
