import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import {
  exportWordReport,
  normalizeReport,
  regenerateInterviewRecord,
  saveManualFields,
  updateUncertainItems,
} from "../api";
import { StatusPill } from "../components/StatusPill";
import { db } from "../firebase";
import {
  MANUAL_FIELD_LABELS,
  createEmptyManualFields,
  type ManualFields,
  type ReportRecord,
  type UncertainItem,
} from "../types";

function formatDateTime(value?: Date | null): string {
  return value ? value.toLocaleString("zh-TW") : "-";
}

export function ReportDetailPage() {
  const { reportId = "" } = useParams();
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [manualFields, setManualFields] = useState<ManualFields>(createEmptyManualFields());
  const [manualDirty, setManualDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reportId) {
      return;
    }

    return onSnapshot(doc(db, "reports", reportId), (snapshot) => {
      if (!snapshot.exists()) {
        setReport(null);
        return;
      }

      const nextReport = normalizeReport(snapshot.id, snapshot.data());
      setReport(nextReport);
      setManualFields((current) => (manualDirty ? current : nextReport.manualFields));
    });
  }, [manualDirty, reportId]);

  const pendingItems = useMemo(
    () => report?.uncertainItems.filter((item) => item.status === "pending") ?? [],
    [report?.uncertainItems],
  );
  const canExport = Boolean(
    report
      && report.processingStatus === "ready"
      && report.interviewRecordAiText.trim()
      && pendingItems.length === 0,
  );
  const exportBlockedMessage = useMemo(() => {
    if (!report) {
      return "";
    }
    if (report.processingStatus !== "ready") {
      return "系統尚未完成整理，完成後才能匯出。";
    }
    if (!report.interviewRecordAiText.trim()) {
      return "訪談記錄尚未生成完成，暫時不能匯出。";
    }
    if (pendingItems.length > 0) {
      return "仍有待確認項目，請先確認後再匯出。";
    }
    return "";
  }, [pendingItems.length, report]);

  async function persistManualFields(): Promise<void> {
    if (!report) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveManualFields(report.id, manualFields);
      setManualDirty(false);
      setNotice("手動欄位已儲存。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function updateUncertainStatus(
    item: UncertainItem,
    status: UncertainItem["status"],
  ): Promise<void> {
    if (!report) {
      return;
    }
    const nextItems = report.uncertainItems.map((current) =>
      current.id === item.id ? { ...current, status } : current,
    );
    setError("");
    setNotice("");
    try {
      await updateUncertainItems(report.id, nextItems);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "更新待確認項目失敗");
    }
  }

  if (!report) {
    return (
      <main className="page-shell">
        <section className="card">
          <p>找不到這份報告。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Report detail</p>
          <h2>{report.manualFields["公司名稱"] || report.audioUpload?.fileName || "拜訪報告"}</h2>
          <p>
            建立於 {formatDateTime(report.createdAt)}，資料將在 {formatDateTime(report.expiresAt)} 自動刪除。
          </p>
        </div>
        <div className="hero-meta">
          <StatusPill status={report.processingStatus} />
          <span>{report.statusDetail}</span>
          <span className="provider-chip">
            {report.providerSnapshot.provider.toUpperCase()} / {report.providerSnapshot.summaryModel}
          </span>
        </div>
      </section>

      {(notice || error) && (
        <section className="card">
          {notice && <p className="success-text">{notice}</p>}
          {error && <p className="error-text">{error}</p>}
        </section>
      )}

      <section className="two-column-grid">
        <article className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">AI output</p>
              <h3>訪談記錄</h3>
            </div>
            <button
              className="ghost-button"
              disabled={regenerating || !report.transcript?.text}
              onClick={async () => {
                setRegenerating(true);
                setError("");
                setNotice("");
                try {
                  await regenerateInterviewRecord(report.id);
                  setNotice("已重新生成訪談記錄。");
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : "重跑失敗");
                } finally {
                  setRegenerating(false);
                }
              }}
            >
              {regenerating ? "重跑中..." : "重新生成"}
            </button>
          </div>
          <div className="rich-text-panel">
            {report.interviewRecordAiText ? (
              report.interviewRecordAiText
                .split(/\n{2,}/)
                .map((paragraph) => <p key={paragraph}>{paragraph}</p>)
            ) : (
              <p className="subtle-text">系統尚未完成訪談記錄生成。</p>
            )}
          </div>
        </article>

        <article className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Checklist</p>
              <h3>待確認項目</h3>
            </div>
            <span className="subtle-text">{pendingItems.length} 項未處理</span>
          </div>
          <div className="stack">
            {report.uncertainItems.length === 0 && <p className="subtle-text">目前沒有待確認項目。</p>}
            {report.uncertainItems.map((item) => (
              <article className="uncertain-card" key={item.id}>
                <div>
                  <p>{item.text}</p>
                  <small>{item.reason}</small>
                </div>
                <div className="inline-actions">
                  <button
                    className={item.status === "confirmed" ? "primary-button" : "ghost-button"}
                    onClick={() => void updateUncertainStatus(item, "confirmed")}
                  >
                    確認
                  </button>
                  <button
                    className={item.status === "dismissed" ? "ghost-button is-active" : "ghost-button"}
                    onClick={() => void updateUncertainStatus(item, "dismissed")}
                  >
                    不採用
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Transcript</p>
            <h3>逐字稿</h3>
          </div>
          <button className="ghost-button" onClick={() => setTranscriptOpen((current) => !current)}>
            {transcriptOpen ? "收合" : "展開"}
          </button>
        </div>
        {transcriptOpen && (
          <div className="transcript-panel">{report.transcript?.text || "尚無逐字稿"}</div>
        )}
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Manual fields</p>
            <h3>人工補填欄位</h3>
          </div>
          <div className="inline-actions">
            <button
              className="ghost-button"
              disabled={!manualDirty || saving}
              onClick={() => void persistManualFields()}
            >
              {saving ? "儲存中..." : "儲存欄位"}
            </button>
            <button
              className="primary-button"
              disabled={exporting || !canExport}
              onClick={async () => {
                setExporting(true);
                setError("");
                setNotice("");
                try {
                  const result = await exportWordReport({
                    reportId: report.id,
                    manualFields,
                    uncertainItems: report.uncertainItems,
                  });
                  setManualDirty(false);
                  setNotice(`已匯出 ${result.fileName}`);
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : "匯出失敗");
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? "匯出中..." : "匯出 Word"}
            </button>
          </div>
        </div>
        {exportBlockedMessage && <p className="subtle-text">{exportBlockedMessage}</p>}

        <div className="form-grid">
          {MANUAL_FIELD_LABELS.map((label) => (
            <label className="field" key={label}>
              <span>{label}</span>
              {label === "公司地址" || label === "主要營運方向" ? (
                <textarea
                  rows={3}
                  value={manualFields[label]}
                  onChange={(event) => {
                    setManualFields((current) => ({ ...current, [label]: event.target.value }));
                    setManualDirty(true);
                  }}
                />
              ) : (
                <input
                  value={manualFields[label]}
                  onChange={(event) => {
                    setManualFields((current) => ({ ...current, [label]: event.target.value }));
                    setManualDirty(true);
                  }}
                />
              )}
            </label>
          ))}
        </div>
      </section>
    </main>
  );
}
