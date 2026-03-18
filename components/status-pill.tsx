import { LoaderCircle } from "lucide-react";

import type { ReportStatus } from "@/lib/report-schema";

const LABELS: Record<ReportStatus, string> = {
  queued: "等待處理",
  processing: "處理中",
  completed: "已完成",
  failed: "處理失敗"
};

export function StatusPill({ status }: { status: ReportStatus }) {
  return (
    <div className="status-pill" data-status={status}>
      {(status === "queued" || status === "processing") && <LoaderCircle size={14} className="spin" />}
      <span>{LABELS[status]}</span>
    </div>
  );
}
