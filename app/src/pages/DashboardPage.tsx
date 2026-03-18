import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import { createAndUploadReport, normalizeReport } from "../api";
import { StatusPill } from "../components/StatusPill";
import { db } from "../firebase";
import type { ReportRecord } from "../types";

function formatDate(value?: Date | null): string {
  if (!value) {
    return "-";
  }
  return value.toLocaleString("zh-TW");
}

export function DashboardPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [searchCompany, setSearchCompany] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }

    const reportsQuery = query(collection(db, "reports"), where("ownerUid", "==", user.uid));
    return onSnapshot(reportsQuery, (snapshot) => {
      const nextReports = snapshot.docs
        .map((docSnapshot) => normalizeReport(docSnapshot.id, docSnapshot.data()))
        .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0));
      setReports(nextReports);
    });
  }, [user]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const companyMatches = !searchCompany
        || report.manualFields["公司名稱"].includes(searchCompany)
        || report.companyNameNormalized.includes(searchCompany.trim().toLowerCase());
      const dateMatches = !searchDate
        || report.manualFields["客戶拜訪記錄日期"]?.includes(searchDate)
        || report.createdAt?.toISOString().slice(0, 10) === searchDate;
      return companyMatches && dateMatches;
    });
  }, [reports, searchCompany, searchDate]);

  const readyCount = reports.filter((report) => report.processingStatus === "ready").length;
  const failedCount = reports.filter((report) => report.processingStatus === "failed").length;

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Sales workspace</p>
          <h2>{profile?.displayName || "業務同仁"}，今天的拜訪紀錄從這裡開始</h2>
          <p>
            上傳錄音後，系統會先產生逐字稿與訪談記錄。你只需要補手動欄位、確認待確認項目，再匯出 Word。
          </p>
        </div>
        <div className="metric-grid">
          <article className="metric-card">
            <span>24 小時內報告</span>
            <strong>{reports.length}</strong>
          </article>
          <article className="metric-card">
            <span>已完成</span>
            <strong>{readyCount}</strong>
          </article>
          <article className="metric-card">
            <span>處理失敗</span>
            <strong>{failedCount}</strong>
          </article>
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Upload</p>
            <h3>新增一筆拜訪錄音</h3>
          </div>
        </div>
        <label className="upload-dropzone">
          <input
            accept="audio/*"
            type="file"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) {
                return;
              }
              setUploading(true);
              setUploadError("");
              try {
                const reportId = await createAndUploadReport(file);
                navigate(`/reports/${reportId}`);
              } catch (error) {
                setUploadError(error instanceof Error ? error.message : "上傳失敗");
              } finally {
                setUploading(false);
              }
            }}
            disabled={uploading}
          />
          <strong>{uploading ? "正在建立報告..." : "點擊上傳錄音檔"}</strong>
          <span>支援 m4a / mp3 / wav。已取消 Firebase Storage，單檔請控制在 28MB 內。</span>
        </label>
        {uploadError && <p className="error-text">{uploadError}</p>}
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Reports</p>
            <h3>我的報告列表</h3>
          </div>
          <div className="filter-row">
            <label className="field compact-field">
              <span>公司名稱</span>
              <input
                value={searchCompany}
                onChange={(event) => setSearchCompany(event.target.value)}
                placeholder="輸入公司名稱"
              />
            </label>
            <label className="field compact-field">
              <span>日期</span>
              <input
                type="date"
                value={searchDate}
                onChange={(event) => setSearchDate(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="report-list">
          {filteredReports.map((report) => (
            <article className="report-card" key={report.id}>
              <div className="report-card-top">
                <div>
                  <h4>{report.manualFields["公司名稱"] || "未填公司名稱"}</h4>
                  <p>{report.audioUpload?.fileName}</p>
                </div>
                <StatusPill status={report.processingStatus} />
              </div>
              <dl className="mini-grid">
                <div>
                  <dt>建立時間</dt>
                  <dd>{formatDate(report.createdAt)}</dd>
                </div>
                <div>
                  <dt>拜訪日期</dt>
                  <dd>{report.manualFields["客戶拜訪記錄日期"] || "-"}</dd>
                </div>
                <div>
                  <dt>待確認項目</dt>
                  <dd>{report.uncertainItems.filter((item) => item.status === "pending").length}</dd>
                </div>
                <div>
                  <dt>AI Provider</dt>
                  <dd>{report.providerSnapshot.provider.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>成本估算</dt>
                  <dd>US${report.usageMetrics.estimatedCostUsd.toFixed(4)}</dd>
                </div>
              </dl>
              <div className="inline-actions">
                <Link className="primary-button" to={`/reports/${report.id}`}>
                  進入報告
                </Link>
                {report.exportArtifact && (
                  <span className="subtle-text">{report.exportArtifact.fileName}</span>
                )}
              </div>
              {report.errorMessage && <p className="error-text">{report.errorMessage}</p>}
            </article>
          ))}

          {filteredReports.length === 0 && (
            <div className="empty-state">
              <p>目前沒有符合條件的報告。</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
