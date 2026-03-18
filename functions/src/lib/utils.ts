import { createHash } from "node:crypto";

import type { ManualFields, ReportDocument, UncertainItem, UncertainStatus } from "./types.js";

export function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function buildExportFileName(manualFields: ManualFields, reportId: string): string {
  const company = manualFields["公司名稱"]?.trim() || "未命名客戶";
  const date = manualFields["客戶拜訪記錄日期"]?.trim() || new Date().toISOString().slice(0, 10);
  return `${date}-${company}-${reportId.slice(0, 6)}.docx`.replace(/[\\/:*?"<>|]/g, "-");
}

export function ensureNoPendingUncertainty(items: UncertainItem[]): void {
  if (items.some((item) => item.status === "pending")) {
    throw new Error("仍有待確認項目，請先處理後再匯出。");
  }
}

export function ensureReadyForExport(
  report: Pick<ReportDocument, "processingStatus" | "interviewRecordAiText">,
): void {
  if (report.processingStatus !== "ready") {
    throw new Error("報告尚未整理完成，暫時不能匯出。");
  }

  if (!report.interviewRecordAiText.trim()) {
    throw new Error("訪談記錄尚未生成完成，暫時不能匯出。");
  }
}

export function mergeUncertainItemsWithStatuses(
  baseItems: UncertainItem[],
  input: unknown,
): UncertainItem[] {
  if (!Array.isArray(input)) {
    return baseItems;
  }

  const statusById = new Map<string, UncertainStatus>();
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const status = normalizeUncertainStatus(record.status);
    if (!id || !status) {
      continue;
    }
    statusById.set(id, status);
  }

  return baseItems.map((item) => ({
    ...item,
    status: statusById.get(item.id) ?? item.status,
  }));
}

function normalizeUncertainStatus(value: unknown): UncertainStatus | null {
  if (value === "pending" || value === "confirmed" || value === "dismissed") {
    return value;
  }
  return null;
}

export function stableItemId(text: string, index: number): string {
  const hash = createHash("sha1").update(`${index}:${text}`).digest("hex");
  return `uncertain_${hash.slice(0, 12)}`;
}

export function truncateError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return String(error).slice(0, 1000);
}
