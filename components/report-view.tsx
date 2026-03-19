"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCcw } from "lucide-react";

import type { VisitReportRecord } from "@/lib/types";
import { readLocalProviderSettings } from "@/lib/client-settings";
import { formatDisplayDate, formatVisitDate } from "@/lib/formatters";
import { StatusPill } from "@/components/status-pill";

export function ReportView({ initialReport }: { initialReport: VisitReportRecord }) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [pollError, setPollError] = useState("");

  useEffect(() => {
    if (report.status === "completed" || report.status === "failed") {
      return;
    }

    const settings = readLocalProviderSettings();
    if (!settings.apiKey || !settings.transcriptionModel || !settings.reportModel) {
      return;
    }

    let cancelled = false;

    const triggerProcessing = async () => {
      try {
        const response = await fetch(`/api/reports/${report.id}/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(settings)
        });

        const payload = (await response.json()) as { message?: string; report?: VisitReportRecord };

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (!response.ok) {
          throw new Error(payload.message || "無法啟動報告處理。");
        }

        if (!cancelled && payload.report) {
          setReport(payload.report);
          setPollError("");
        }
      } catch (error) {
        if (!cancelled) {
          setPollError(error instanceof Error ? error.message : "無法啟動報告處理。");
        }
      }
    };

    const retryAtMs =
      report.status === "queued"
        ? 0
        : report.processingLeaseExpiresAt
          ? Math.max(0, new Date(report.processingLeaseExpiresAt).getTime() - Date.now() + 1000)
          : 0;

    const timeout = window.setTimeout(() => {
      void triggerProcessing();
    }, retryAtMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [report.id, report.processingLeaseExpiresAt, report.status, router]);

  useEffect(() => {
    if (report.status === "completed" || report.status === "failed") {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/reports/${report.id}/status`, {
          cache: "no-store"
        });

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (!response.ok) {
          throw new Error("無法取得最新狀態。");
        }

        const payload = (await response.json()) as { report: VisitReportRecord };
        setReport(payload.report);
        setPollError("");
      } catch (error) {
        setPollError(error instanceof Error ? error.message : "無法取得最新狀態。");
      }
    }, 4000);

    return () => window.clearInterval(timer);
  }, [report.id, report.status, router]);

  const expiryLabel = useMemo(() => formatDisplayDate(report.expiresAt), [report.expiresAt]);

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="page-actions">
        <Link className="secondary-button" href="/">
          新建報告
        </Link>
        <Link className="secondary-button" href="/settings">
          模型設定
        </Link>
        {report.status === "completed" && (
          <a className="button" href={`/api/reports/${report.id}/docx`}>
            <Download size={16} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
            下載報告
          </a>
        )}
      </div>

      <section className="panel">
        <div className="panel-content">
          <div className="split-header">
            <div>
              <div className="eyebrow">報告內容</div>
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
            此報告為短期工作檔，將於 <strong>{expiryLabel}</strong> 自動失效。
          </div>

          {pollError && (
            <div className="notice" data-tone="danger" style={{ marginTop: 18 }}>
              {pollError}
            </div>
          )}

          {report.status === "queued" || report.status === "processing" ? (
            <div className="notice" style={{ marginTop: 18 }}>
              <RefreshCcw size={14} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
              系統正在分析錄音，頁面會自動更新狀態。
            </div>
          ) : null}

          {report.status === "failed" ? (
            <div className="notice" data-tone="danger" style={{ marginTop: 18 }}>
              {report.errorMessage || "報告處理失敗，請重新送件。"}
            </div>
          ) : null}
        </div>
      </section>

      {report.status === "completed" && (
        <section className="panel">
          <div className="panel-content">
            <div className="report-grid">
              <article className="report-card">
                <h3>摘要</h3>
                <ul className="muted-list">
                  {report.summary.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="report-card">
                <h3>行銷現況</h3>
                <p>{report.currentMarketingStatus}</p>
              </article>

              <article className="report-card" style={{ gridColumn: "1 / -1" }}>
                <h3>拜訪紀要</h3>
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
                <h3>合作目標</h3>
                <ul className="muted-list">
                  {report.goals.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="report-card" style={{ gridColumn: "1 / -1" }}>
                <h3>待確認事項</h3>
                {report.uncertaintyNotes.length ? (
                  <ul className="muted-list">
                    {report.uncertaintyNotes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>目前沒有額外待確認事項。</p>
                )}
              </article>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
