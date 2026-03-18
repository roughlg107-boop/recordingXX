import type { ProcessingStatus } from "../types";

const labelMap: Record<ProcessingStatus, string> = {
  queued: "等待中",
  uploading: "已上傳",
  transcribing: "轉錄中",
  summarizing: "整理中",
  ready: "完成",
  failed: "失敗",
  exporting: "匯出中",
  expired: "已刪除",
};

export function StatusPill({ status }: { status: ProcessingStatus }) {
  return <span className={`status-pill status-${status}`}>{labelMap[status]}</span>;
}
