import type { Timestamp } from "firebase-admin/firestore";

export const REGION = "asia-east1";

export const MANUAL_FIELD_LABELS = [
  "客戶拜訪記錄日期",
  "拜訪對象",
  "對象職稱",
  "公司名稱",
  "手機",
  "公司資本額",
  "公司地址",
  "公司統編",
  "主力產品",
  "電話",
  "傳真",
  "老闆穿著",
  "有無小編",
  "有無配合行銷公司",
  "主要營運方向",
] as const;

export type ManualFieldLabel = (typeof MANUAL_FIELD_LABELS)[number];
export type UserRole = "sales" | "admin";
export type AiProvider = "openai" | "gemini";
export type ProcessingStatus =
  | "queued"
  | "uploading"
  | "transcribing"
  | "summarizing"
  | "ready"
  | "failed"
  | "exporting"
  | "expired";

export type UncertainStatus = "pending" | "confirmed" | "dismissed";

export interface UncertainItem {
  id: string;
  text: string;
  reason: string;
  status: UncertainStatus;
}

export interface AudioUploadInfo {
  fileName: string;
  contentType: string;
  size: number;
}

export interface TranscriptInfo {
  text: string;
  language?: string;
  durationSeconds?: number;
}

export interface ExportArtifact {
  fileName: string;
  generatedAt: Timestamp | null;
}

export interface UsageMetrics {
  durationSeconds: number;
  estimatedCostUsd: number;
  transcriptionCostUsd: number;
  summaryCostUsd: number;
  transcriptionInputTokens: number;
  transcriptionOutputTokens: number;
  summaryInputTokens: number;
  summaryOutputTokens: number;
}

export interface ProviderSnapshot {
  provider: AiProvider;
  transcriptModel: string;
  summaryModel: string;
}

export interface ProviderStoredConfig {
  apiKeyCiphertext: string;
  apiKeyPreview: string;
  transcriptModel: string;
  summaryModel: string;
}

export interface AiSettingsDocument {
  activeProvider: AiProvider;
  providers: Record<AiProvider, ProviderStoredConfig>;
  updatedAt: Timestamp | null;
  updatedByUid: string;
  updatedByName: string;
}

export interface AiSettingsPayload {
  activeProvider: AiProvider;
  providers: Record<
    AiProvider,
    {
      apiKey: string;
      apiKeyPreview: string;
      transcriptModel: string;
      summaryModel: string;
      hasApiKey: boolean;
    }
  >;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  disabled: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ManualFields = Record<ManualFieldLabel, string>;

export interface ReportDocument {
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  providerSnapshot: ProviderSnapshot;
  companyNameNormalized: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  processingStatus: ProcessingStatus;
  statusDetail: string;
  errorMessage: string | null;
  audioUpload: AudioUploadInfo | null;
  interviewRecordAiText: string;
  uncertainItems: UncertainItem[];
  transcript: TranscriptInfo | null;
  manualFields: ManualFields;
  exportArtifact: ExportArtifact | null;
  regenerateCount: number;
  usageMetrics: UsageMetrics;
}

export function createEmptyManualFields(): ManualFields {
  return Object.fromEntries(
    MANUAL_FIELD_LABELS.map((label) => [label, ""]),
  ) as ManualFields;
}

export function createEmptyUsageMetrics(): UsageMetrics {
  return {
    durationSeconds: 0,
    estimatedCostUsd: 0,
    transcriptionCostUsd: 0,
    summaryCostUsd: 0,
    transcriptionInputTokens: 0,
    transcriptionOutputTokens: 0,
    summaryInputTokens: 0,
    summaryOutputTokens: 0,
  };
}
