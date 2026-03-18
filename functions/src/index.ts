import { promises as fs } from "node:fs";
import path from "node:path";

import Busboy from "busboy";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import {
  BOOTSTRAP_ADMIN_SECRET,
  GEMINI_SUMMARIZE_INPUT_COST_PER_MILLION,
  GEMINI_SUMMARIZE_OUTPUT_COST_PER_MILLION,
  OPENAI_SUMMARIZE_INPUT_COST_PER_MILLION,
  OPENAI_SUMMARIZE_OUTPUT_COST_PER_MILLION,
  OPENAI_SUMMARIZE_MODEL,
  OPENAI_TRANSCRIBE_MODEL,
  OPENAI_TRANSCRIBE_COST_PER_MINUTE_USD,
  SUMMARIZE_INPUT_COST_PER_MILLION,
  SUMMARIZE_OUTPUT_COST_PER_MILLION,
  TRANSCRIBE_COST_PER_MINUTE_USD,
  GEMINI_TRANSCRIBE_INPUT_COST_PER_MILLION,
  GEMINI_TRANSCRIBE_OUTPUT_COST_PER_MILLION,
  parseNumberConfig,
} from "./lib/config.js";
import {
  getAiSettingsPayload,
  resolveProviderSnapshot,
  resolveRuntimeProviderConfig,
  saveAiSettings,
} from "./lib/aiSettings.js";
import { requireAuth, requireReportAccess, requireRole, getUserProfile } from "./lib/auth.js";
import { buildReportDocx } from "./lib/docxTemplate.js";
import { adminAuth, db } from "./lib/firebaseAdmin.js";
import {
  summarizeToInterviewRecordWithGemini,
  transcribeAudioWithGemini,
} from "./lib/geminiProvider.js";
import {
  createTempWorkspace,
  getAudioDurationSeconds,
  normalizeAudioForTranscription,
} from "./lib/media.js";
import { summarizeToInterviewRecord, transcribeAudio } from "./lib/openaiProvider.js";
import {
  createEmptyManualFields,
  createEmptyUsageMetrics,
  REGION,
  type ManualFields,
  type ReportDocument,
  type UncertainItem,
  type UserRole,
} from "./lib/types.js";
import {
  buildExportFileName,
  ensureNoPendingUncertainty,
  ensureReadyForExport,
  mergeUncertainItemsWithStatuses,
  normalizeSearchValue,
  truncateError,
} from "./lib/utils.js";

const REPORTS_COLLECTION = "reports";
const USERS_COLLECTION = "users";
const MAX_DIRECT_UPLOAD_BYTES = 28 * 1024 * 1024;
type RuntimeProviderConfig = Awaited<ReturnType<typeof resolveRuntimeProviderConfig>>;

function isAudioContentType(contentType?: string): boolean {
  return Boolean(contentType && contentType.startsWith("audio/"));
}

function asStringRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "參數格式錯誤。");
  }
  return value as Record<string, unknown>;
}

function parseManualFields(input: unknown): ManualFields {
  const payload = asStringRecord(input);
  const manualFields = createEmptyManualFields();
  for (const label of Object.keys(manualFields) as Array<keyof ManualFields>) {
    const rawValue = payload[label];
    manualFields[label] = typeof rawValue === "string" ? rawValue : "";
  }
  return manualFields;
}

function calculateTokenCostUsd(options: {
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillion: string;
  outputCostPerMillion: string;
  fallbackInputCost: number;
  fallbackOutputCost: number;
}): number {
  const inputRate = parseNumberConfig(options.inputCostPerMillion, options.fallbackInputCost);
  const outputRate = parseNumberConfig(options.outputCostPerMillion, options.fallbackOutputCost);
  return (
    (options.inputTokens / 1_000_000) * inputRate +
    (options.outputTokens / 1_000_000) * outputRate
  );
}

function calculateTranscriptionCostUsd(options: {
  provider: RuntimeProviderConfig["provider"];
  durationSeconds: number;
  inputTokens: number;
  outputTokens: number;
}): number {
  if (options.provider === "gemini") {
    return calculateTokenCostUsd({
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      inputCostPerMillion: GEMINI_TRANSCRIBE_INPUT_COST_PER_MILLION.value(),
      outputCostPerMillion: GEMINI_TRANSCRIBE_OUTPUT_COST_PER_MILLION.value(),
      fallbackInputCost: 0.3,
      fallbackOutputCost: 2.5,
    });
  }

  return (
    (options.durationSeconds / 60)
    * parseNumberConfig(
      OPENAI_TRANSCRIBE_COST_PER_MINUTE_USD.value() || TRANSCRIBE_COST_PER_MINUTE_USD.value(),
      0.006,
    )
  );
}

async function summarizeTranscriptWithProvider(
  runtimeProvider: RuntimeProviderConfig,
  transcript: string,
): Promise<{
  interviewRecordAiText: string;
  uncertainItems: UncertainItem[];
  summaryCostUsd: number;
  summaryInputTokens: number;
  summaryOutputTokens: number;
}> {
  if (runtimeProvider.provider === "gemini") {
    return summarizeToInterviewRecordWithGemini({
      apiKey: runtimeProvider.apiKey,
      transcript,
      model: runtimeProvider.summaryModel,
      inputCostPerMillion: GEMINI_SUMMARIZE_INPUT_COST_PER_MILLION.value(),
      outputCostPerMillion: GEMINI_SUMMARIZE_OUTPUT_COST_PER_MILLION.value(),
    });
  }

  return summarizeToInterviewRecord({
    apiKey: runtimeProvider.apiKey,
    transcript,
    model: runtimeProvider.summaryModel || OPENAI_SUMMARIZE_MODEL.value(),
    inputCostPerMillion:
      OPENAI_SUMMARIZE_INPUT_COST_PER_MILLION.value() || SUMMARIZE_INPUT_COST_PER_MILLION.value(),
    outputCostPerMillion:
      OPENAI_SUMMARIZE_OUTPUT_COST_PER_MILLION.value() || SUMMARIZE_OUTPUT_COST_PER_MILLION.value(),
  });
}

async function verifyHttpUser(
  request: { headers: Record<string, string | string[] | undefined> },
): Promise<string> {
  const authorization = request.headers.authorization;
  const bearer = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!bearer?.startsWith("Bearer ")) {
    throw new Error("缺少登入憑證。");
  }

  const decoded = await adminAuth.verifyIdToken(bearer.slice("Bearer ".length));
  const profile = await getUserProfile(decoded.uid);
  if (profile.disabled) {
    throw new Error("帳號已停用。");
  }
  return decoded.uid;
}

async function parseMultipartAudioUpload(request: {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}): Promise<{
  reportId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
}> {
  const contentTypeHeader = request.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
  if (!contentType?.includes("multipart/form-data")) {
    throw new Error("請使用 multipart/form-data 上傳音檔。");
  }

  const rawBody = request.rawBody;
  if (!rawBody?.length) {
    throw new Error("找不到上傳內容。");
  }

  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: {
        "content-type": contentType,
      },
      limits: {
        files: 1,
        fileSize: MAX_DIRECT_UPLOAD_BYTES,
      },
    });

    let reportId = "";
    let fileName = "";
    let mimeType = "";
    const chunks: Buffer[] = [];
    let fileSeen = false;

    busboy.on("field", (fieldName, value) => {
      if (fieldName === "reportId") {
        reportId = value.trim();
      }
    });

    busboy.on("file", (_fieldName, file, info) => {
      fileSeen = true;
      fileName = info.filename;
      mimeType = info.mimeType;

      file.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      file.on("limit", () => {
        reject(new Error("音檔超過 28MB，請先壓縮或縮短錄音。"));
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", () => {
      if (!reportId || !fileSeen) {
        reject(new Error("缺少 reportId 或音檔。"));
        return;
      }
      if (!fileName || !isAudioContentType(mimeType)) {
        reject(new Error("只支援音訊格式檔案。"));
        return;
      }

      resolve({
        reportId,
        fileName,
        contentType: mimeType,
        buffer: Buffer.concat(chunks),
      });
    });

    busboy.end(rawBody);
  });
}

async function updateReportFailure(reportId: string, error: unknown): Promise<void> {
  await db.collection(REPORTS_COLLECTION).doc(reportId).set(
    {
      processingStatus: "failed",
      statusDetail: "處理失敗",
      errorMessage: truncateError(error),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function processAudioForReport(options: {
  reportId: string;
  report: ReportDocument;
  sourcePath: string;
}): Promise<void> {
  const reportRef = db.collection(REPORTS_COLLECTION).doc(options.reportId);
  const workingDir = path.dirname(options.sourcePath);

  try {
    await reportRef.set(
      {
        processingStatus: "transcribing",
        statusDetail: "正在轉錄錄音",
        updatedAt: FieldValue.serverTimestamp(),
        errorMessage: null,
      },
      { merge: true },
    );

    const normalizedPath = await normalizeAudioForTranscription(options.sourcePath, workingDir);
    const durationSeconds = await getAudioDurationSeconds(normalizedPath);
    const runtimeProvider = await resolveRuntimeProviderConfig(options.report.providerSnapshot);
    const transcriptResult =
      runtimeProvider.provider === "gemini"
        ? await transcribeAudioWithGemini({
            apiKey: runtimeProvider.apiKey,
            audioPath: normalizedPath,
            model: runtimeProvider.transcriptModel,
          })
        : await transcribeAudio({
            apiKey: runtimeProvider.apiKey,
            audioPath: normalizedPath,
            model: runtimeProvider.transcriptModel || OPENAI_TRANSCRIBE_MODEL.value(),
          });

    const transcriptionCostUsd = calculateTranscriptionCostUsd({
      provider: runtimeProvider.provider,
      durationSeconds,
      inputTokens: transcriptResult.inputTokens,
      outputTokens: transcriptResult.outputTokens,
    });

    await reportRef.set(
      {
        processingStatus: "summarizing",
        statusDetail: "正在整理訪談記錄",
        transcript: {
          text: transcriptResult.text,
          durationSeconds,
          language: "zh-TW",
        },
        usageMetrics: {
          ...(options.report.usageMetrics ?? createEmptyUsageMetrics()),
          durationSeconds,
          transcriptionCostUsd,
          transcriptionInputTokens: transcriptResult.inputTokens,
          transcriptionOutputTokens: transcriptResult.outputTokens,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const normalizedSummary = await summarizeTranscriptWithProvider(
      runtimeProvider,
      transcriptResult.text,
    );
    const estimatedCostUsd = transcriptionCostUsd + normalizedSummary.summaryCostUsd;

    await reportRef.set(
      {
        processingStatus: "ready",
        statusDetail:
          normalizedSummary.uncertainItems.length > 0 ? "已完成，含待確認項目" : "已完成",
        interviewRecordAiText: normalizedSummary.interviewRecordAiText,
        uncertainItems: normalizedSummary.uncertainItems,
        usageMetrics: {
          durationSeconds,
          estimatedCostUsd,
          transcriptionCostUsd,
          summaryCostUsd: normalizedSummary.summaryCostUsd,
          transcriptionInputTokens: transcriptResult.inputTokens,
          transcriptionOutputTokens: transcriptResult.outputTokens,
          summaryInputTokens: normalizedSummary.summaryInputTokens,
          summaryOutputTokens: normalizedSummary.summaryOutputTokens,
        },
        updatedAt: FieldValue.serverTimestamp(),
        errorMessage: null,
      },
      { merge: true },
    );
  } catch (error) {
    logger.error("Audio processing failed", error);
    await updateReportFailure(options.reportId, error);
    throw error;
  } finally {
    await fs.rm(workingDir, { recursive: true, force: true });
  }
}

export const createReportDraft = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const profile = await getUserProfile(uid);
  const payload = asStringRecord(request.data);
  const fileName = String(payload.fileName ?? "").trim();
  const contentType = String(payload.contentType ?? "").trim();
  const size = Number(payload.size ?? 0);

  if (
    !fileName
    || !contentType
    || !isAudioContentType(contentType)
    || !Number.isFinite(size)
    || size <= 0
  ) {
    throw new HttpsError("invalid-argument", "請提供有效的音檔資訊。");
  }
  if (size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new HttpsError("invalid-argument", "目前已取消 Firebase Storage，單檔請控制在 28MB 內。");
  }

  const reportRef = db.collection(REPORTS_COLLECTION).doc();
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  const report: ReportDocument = {
    ownerUid: uid,
    ownerEmail: profile.email,
    ownerName: profile.displayName,
    providerSnapshot: await resolveProviderSnapshot(),
    companyNameNormalized: "",
    createdAt: null,
    updatedAt: null,
    expiresAt,
    processingStatus: "queued",
    statusDetail: "等待上傳音檔",
    errorMessage: null,
    audioUpload: {
      fileName,
      contentType,
      size,
    },
    interviewRecordAiText: "",
    uncertainItems: [],
    transcript: null,
    manualFields: createEmptyManualFields(),
    exportArtifact: null,
    regenerateCount: 0,
    usageMetrics: createEmptyUsageMetrics(),
  };

  await reportRef.set({
    ...report,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    reportId: reportRef.id,
  };
});

export const processUploadedAudio = onRequest(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Headers", "authorization,content-type");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const uid = await verifyHttpUser(request);
      const upload = await parseMultipartAudioUpload(request);
      const report = await requireReportAccess(uid, upload.reportId);
      const reportRef = db.collection(REPORTS_COLLECTION).doc(upload.reportId);

      await reportRef.set(
        {
          processingStatus: "uploading",
          statusDetail: "已收到錄音，準備處理",
          audioUpload: {
            fileName: upload.fileName,
            contentType: upload.contentType,
            size: upload.buffer.byteLength,
          },
          updatedAt: FieldValue.serverTimestamp(),
          errorMessage: null,
        },
        { merge: true },
      );

      const workingDir = await createTempWorkspace(upload.reportId);
      const originalExt = path.extname(upload.fileName) || ".audio";
      const originalPath = path.join(workingDir, `source${originalExt}`);
      await fs.writeFile(originalPath, upload.buffer);
      await processAudioForReport({
        reportId: upload.reportId,
        report,
        sourcePath: originalPath,
      });

      response.json({ ok: true });
    } catch (error) {
      const message = truncateError(error);
      const maybeReportId =
        typeof request.body?.reportId === "string" ? request.body.reportId : undefined;
      if (maybeReportId) {
        await updateReportFailure(maybeReportId, message).catch(() => undefined);
      }
      response.status(400).json({ error: message });
      return;
    }
  },
);

export const regenerateInterviewRecord = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request) => {
    const uid = requireAuth(request);
    const payload = asStringRecord(request.data);
    const reportId = String(payload.reportId ?? "");
    const report = await requireReportAccess(uid, reportId);

    if (!report.transcript?.text) {
      throw new HttpsError("failed-precondition", "這份報告還沒有逐字稿，無法重跑。");
    }

    const reportRef = db.collection(REPORTS_COLLECTION).doc(reportId);
    await reportRef.set(
      {
        processingStatus: "summarizing",
        statusDetail: "正在重新整理訪談記錄",
        updatedAt: FieldValue.serverTimestamp(),
        errorMessage: null,
      },
      { merge: true },
    );

    try {
      const runtimeProvider = await resolveRuntimeProviderConfig(report.providerSnapshot);
      const summary = await summarizeTranscriptWithProvider(runtimeProvider, report.transcript.text);

      const previousMetrics = report.usageMetrics ?? createEmptyUsageMetrics();
      const usageMetrics = {
        ...previousMetrics,
        summaryCostUsd: previousMetrics.summaryCostUsd + summary.summaryCostUsd,
        estimatedCostUsd: previousMetrics.estimatedCostUsd + summary.summaryCostUsd,
        summaryInputTokens: previousMetrics.summaryInputTokens + summary.summaryInputTokens,
        summaryOutputTokens: previousMetrics.summaryOutputTokens + summary.summaryOutputTokens,
      };

      await reportRef.set(
        {
          interviewRecordAiText: summary.interviewRecordAiText,
          uncertainItems: summary.uncertainItems,
          regenerateCount: FieldValue.increment(1),
          processingStatus: "ready",
          statusDetail: summary.uncertainItems.length > 0 ? "已重跑，含待確認項目" : "已重跑",
          updatedAt: FieldValue.serverTimestamp(),
          usageMetrics,
          errorMessage: null,
        },
        { merge: true },
      );

      return {
        ok: true,
      };
    } catch (error) {
      await updateReportFailure(reportId, error);
      throw new HttpsError("internal", truncateError(error));
    }
  },
);

export const saveReportManualFields = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const payload = asStringRecord(request.data);
  const reportId = String(payload.reportId ?? "");
  await requireReportAccess(uid, reportId);
  const manualFields = parseManualFields(payload.manualFields);

  await db.collection(REPORTS_COLLECTION).doc(reportId).set(
    {
      manualFields,
      companyNameNormalized: normalizeSearchValue(manualFields["公司名稱"]),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
});

export const markReportUploadFailed = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const payload = asStringRecord(request.data);
  const reportId = String(payload.reportId ?? "");
  const message = String(payload.message ?? "錄音上傳失敗");
  await requireReportAccess(uid, reportId);
  await updateReportFailure(reportId, message);
  return { ok: true };
});

export const updateReportUncertainItems = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const payload = asStringRecord(request.data);
  const reportId = String(payload.reportId ?? "");
  const report = await requireReportAccess(uid, reportId);
  const uncertainItems = mergeUncertainItemsWithStatuses(report.uncertainItems, payload.uncertainItems);

  await db.collection(REPORTS_COLLECTION).doc(reportId).set(
    {
      uncertainItems,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
});

export const exportReportDocx = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const payload = asStringRecord(request.data);
  const reportId = String(payload.reportId ?? "");
  const report = await requireReportAccess(uid, reportId);
  const manualFields = parseManualFields(payload.manualFields);
  const uncertainItems = mergeUncertainItemsWithStatuses(report.uncertainItems, payload.uncertainItems);

  try {
    ensureReadyForExport(report);
    ensureNoPendingUncertainty(uncertainItems);
  } catch (error) {
    throw new HttpsError("failed-precondition", truncateError(error));
  }

  const reportRef = db.collection(REPORTS_COLLECTION).doc(reportId);
  await reportRef.set(
    {
      processingStatus: "exporting",
      statusDetail: "正在產出 Word 報告",
      manualFields,
      companyNameNormalized: normalizeSearchValue(manualFields["公司名稱"]),
      uncertainItems,
      updatedAt: FieldValue.serverTimestamp(),
      errorMessage: null,
    },
    { merge: true },
  );

  try {
    const docxBuffer = await buildReportDocx({
      manualFields,
      interviewRecord: report.interviewRecordAiText,
    });
    const fileName = buildExportFileName(manualFields, reportId);

    await reportRef.set(
      {
        processingStatus: "ready",
        statusDetail: "已匯出 Word",
        exportArtifact: {
          fileName,
          generatedAt: FieldValue.serverTimestamp(),
        },
        manualFields,
        companyNameNormalized: normalizeSearchValue(manualFields["公司名稱"]),
        uncertainItems,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      ok: true,
      fileName,
      base64Content: docxBuffer.toString("base64"),
    };
  } catch (error) {
    await updateReportFailure(reportId, error);
    throw new HttpsError("internal", truncateError(error));
  }
});

export const adminCreateUser = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "admin");
  const payload = asStringRecord(request.data);
  const email = String(payload.email ?? "").trim();
  const password = String(payload.password ?? "").trim();
  const displayName = String(payload.displayName ?? "").trim();
  const role = payload.role === "admin" ? "admin" : "sales";

  if (!email || !password || !displayName) {
    throw new HttpsError("invalid-argument", "請填寫 Email、姓名與密碼。");
  }

  const createdUser = await adminAuth.createUser({
    email,
    password,
    displayName,
    disabled: false,
  });

  await db.collection(USERS_COLLECTION).doc(createdUser.uid).set({
    uid: createdUser.uid,
    email,
    displayName,
    role,
    disabled: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    uid: createdUser.uid,
  };
});

export const getAiSettings = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuth(request);
    await requireRole(uid, "admin");
    return getAiSettingsPayload();
  },
);

export const saveAiProviderSettings = onCall(
  { region: REGION },
  async (request) => {
    const uid = requireAuth(request);
    const profile = await requireRole(uid, "admin");
    const payload = asStringRecord(request.data);
    const activeProvider = payload.activeProvider === "gemini" ? "gemini" : "openai";
    const providersRecord = asStringRecord(payload.providers);
    await saveAiSettings({
      activeProvider,
      providers: {
        openai: {
          apiKey: String(asStringRecord(providersRecord.openai).apiKey ?? ""),
          apiKeyPreview: String(asStringRecord(providersRecord.openai).apiKeyPreview ?? ""),
          transcriptModel: String(asStringRecord(providersRecord.openai).transcriptModel ?? OPENAI_TRANSCRIBE_MODEL.value()),
          summaryModel: String(asStringRecord(providersRecord.openai).summaryModel ?? OPENAI_SUMMARIZE_MODEL.value()),
          hasApiKey: Boolean(asStringRecord(providersRecord.openai).hasApiKey),
        },
        gemini: {
          apiKey: String(asStringRecord(providersRecord.gemini).apiKey ?? ""),
          apiKeyPreview: String(asStringRecord(providersRecord.gemini).apiKeyPreview ?? ""),
          transcriptModel: String(
            asStringRecord(providersRecord.gemini).transcriptModel ?? "gemini-2.5-flash",
          ),
          summaryModel: String(
            asStringRecord(providersRecord.gemini).summaryModel ?? "gemini-2.5-flash",
          ),
          hasApiKey: Boolean(asStringRecord(providersRecord.gemini).hasApiKey),
        },
      },
      updatedByUid: uid,
      updatedByName: profile.displayName,
    });
    return getAiSettingsPayload();
  },
);

export const adminSetUserDisabled = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "admin");
  const payload = asStringRecord(request.data);
  const targetUid = String(payload.uid ?? "");
  const disabled = Boolean(payload.disabled);

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "缺少使用者 ID。");
  }

  await adminAuth.updateUser(targetUid, { disabled });
  await db.collection(USERS_COLLECTION).doc(targetUid).set(
    {
      disabled,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
});

export const adminSetTemporaryPassword = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "admin");
  const payload = asStringRecord(request.data);
  const targetUid = String(payload.uid ?? "");
  const password = String(payload.password ?? "").trim();

  if (!targetUid || !password) {
    throw new HttpsError("invalid-argument", "請提供使用者與暫時密碼。");
  }

  await adminAuth.updateUser(targetUid, { password });
  return { ok: true };
});

export const bootstrapAdmin = onRequest({ region: REGION }, async (request, response) => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Headers", "content-type,x-bootstrap-secret");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const providedSecret =
    request.header("x-bootstrap-secret") ?? String(request.query.secret ?? "");
  if (providedSecret !== BOOTSTRAP_ADMIN_SECRET.value()) {
    response.status(403).json({ error: "Invalid bootstrap secret" });
    return;
  }

  const payload = asStringRecord(request.body);
  const email = String(payload.email ?? "").trim();
  const password = String(payload.password ?? "").trim();
  const displayName = String(payload.displayName ?? "系統管理者").trim();

  if (!email || !password) {
    response.status(400).json({ error: "email and password are required" });
    return;
  }

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(userRecord.uid, {
      password,
      displayName,
      disabled: false,
    });
  } catch {
    userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
      disabled: false,
    });
  }

  await db.collection(USERS_COLLECTION).doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email,
      displayName,
      role: "admin" as UserRole,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  response.json({
    ok: true,
    uid: userRecord.uid,
  });
});

export const cleanupExpiredReports = onSchedule(
  {
    region: REGION,
    schedule: "every 30 minutes",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const now = Timestamp.now();
    const snapshot = await db
      .collection(REPORTS_COLLECTION)
      .where("expiresAt", "<=", now)
      .limit(200)
      .get();

    if (snapshot.empty) {
      return;
    }

    await Promise.all(
      snapshot.docs.map((docSnapshot) => docSnapshot.ref.delete()),
    );
  },
);
