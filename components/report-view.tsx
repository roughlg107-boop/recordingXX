"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw } from "lucide-react";

import type { VisitReportRecord } from "@/lib/types";
import { formatDisplayDate, formatVisitDate } from "@/lib/formatters";
import { StatusPill } from "@/components/status-pill";

export function ReportView({ initialReport }: { initialReport: VisitReportRecord }) {
  const [report, setReport] = useState(initialReport);
  const [pollError, setPollError] = useState("");

  useEffect(() => {
    if (report.status === "completed" || report.status === "failed") {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/reports/${report.id}/status`, {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("無法取得最新狀態。");
        }

        const payload = (await response.json()) as { report: VisitReportRecord };
        setReport(payload.report);
      } catch (error) {
        setPollError(error instanceof Error ? error.message : "無法取得最新狀態。");
      }
    }, 4000);

    return () => window.clearInterval(timer);
  }, [report.id, report.status]);

  const expiryLabel = useMemo(() => formatDisplayDate(report.expiresAt), [report.expiresAt]);

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="page-actions">
        <Link className="secondary-button" href="/">
          新增另一份錄音
        </Link>
        <Link className="secondary-button" href="/settings">
          調整 AI 設定
        </Link>
        {report.status === "completed" && (
          <a className="button" href={`/api/reports/${report.id}/docx`}>
            <Download size={16} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
            下載 Word
          </a>
        )}
      </div>

      <section className="panel">
        <div className="panel-content">
          <div className="split-header">
            <div>
              <div className="eyebrow">Visit Report</div>
              <h2 className="display-title" style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)" }}>
                {report.shopName}
              </h2>
            </div>
            <StatusPill status={report.status} />
          </div>

          <div className="meta-grid">
            <div className="meta-item">
              <span>業務</span>
              <strong>{report.salesName}</strong>
            </div>
            <div className="meta-item">
              <span>拜訪日期</span>
              <strong>{formatVisitDate(report.visitDate)}</strong>
            </div>
            <div className="meta-item">
              <span>到期時間</span>
              <strong>{expiryLabel}</strong>
            </div>
          </div>

          <div className="notice" style={{ marginTop: 18 }}>
            這份報告不是長期留存資料，將於 <strong>{expiryLabel}</strong> 自動失效並刪除。
          </div>

          {pollError && (
            <div className="notice" data-tone="danger" style={{ marginTop: 18 }}>
              {pollError}
            </div>
          )}

          {report.status === "queued" || report.status === "processing" ? (
            <div className="notice" style={{ marginTop: 18 }}>
              <RefreshCcw size={14} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
              系統正在轉寫與整理錄音，頁面會自動刷新狀態。
            </div>
          ) : null}

          {report.status === "failed" ? (
            <div className="notice" data-tone="danger" style={{ marginTop: 18 }}>
              {report.errorMessage || "報告處理失敗，請回上傳頁重新送件。"}
            </div>
          ) : null}
        </div>
      </section>

      {report.status === "completed" && (
        <section className="panel">
          <div className="panel-content">
            <div className="report-grid">
              <article className="report-card">
                <h3>重點摘要</h3>
                <ul className="muted-list">
                  {report.summary.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="report-card">
                <h3>目前行銷現況</h3>
                <p>{report.currentMarketingStatus}</p>
              </article>

              <article className="report-card" style={{ gridColumn: "1 / -1" }}>
                <h3>拜訪脈絡</h3>
                <p>{report.visitNarrative}</p>
              </article>

              <article className="report-card">
                <h3>需求與痛點</h3>
                <ul className="muted-list">
                  {report.needsAndPainPoints.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="report-card">
                <h3>店家目標</h3>
                <ul className="muted-list">
                  {report.goals.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="report-card" style={{ gridColumn: "1 / -1" }}>
                <h3>未確認資訊</h3>
                {report.uncertaintyNotes.length ? (
                  <ul className="muted-list">
                    {report.uncertaintyNotes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>本次整理沒有額外標記到未確認資訊。</p>
                )}
              </article>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
