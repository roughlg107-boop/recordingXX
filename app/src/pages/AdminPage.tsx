import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import {
  adminCreateUserAccount,
  adminSetTemporaryPassword,
  adminSetUserDisabled,
  normalizeReport,
} from "../api";
import { StatusPill } from "../components/StatusPill";
import { db } from "../firebase";
import type { ReportRecord, UserProfile } from "../types";

function normalizeUserProfile(id: string, data: Record<string, unknown>): UserProfile {
  return {
    uid: id,
    email: String(data.email ?? ""),
    displayName: String(data.displayName ?? ""),
    role: data.role === "admin" ? "admin" : "sales",
    disabled: Boolean(data.disabled),
  };
}

export function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "sales" as "sales" | "admin",
  });
  const [passwordTargets, setPasswordTargets] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map((docSnapshot) => normalizeUserProfile(docSnapshot.id, docSnapshot.data())));
    });
    const unsubReports = onSnapshot(collection(db, "reports"), (snapshot) => {
      setReports(
        snapshot.docs
          .map((docSnapshot) => normalizeReport(docSnapshot.id, docSnapshot.data()))
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      );
    });

    return () => {
      unsubUsers();
      unsubReports();
    };
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const statusMatches = !statusFilter || report.processingStatus === statusFilter;
      const companyMatches = !companyFilter
        || report.manualFields["公司名稱"].includes(companyFilter)
        || report.ownerName.includes(companyFilter);
      const dateMatches =
        !dateFilter || report.createdAt?.toISOString().slice(0, 10) === dateFilter;
      return statusMatches && companyMatches && dateMatches;
    });
  }, [companyFilter, dateFilter, reports, statusFilter]);

  const totalCost = reports.reduce((sum, report) => sum + report.usageMetrics.estimatedCostUsd, 0);
  const totalRegenerations = reports.reduce((sum, report) => sum + report.regenerateCount, 0);

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Admin console</p>
          <h2>帳號、處理狀態與成本都在這裡</h2>
          <p>第一版提供帳號管理、報告查詢與 24 小時內的使用量/成本概況。</p>
        </div>
        <div className="metric-grid">
          <article className="metric-card">
            <span>使用者</span>
            <strong>{users.length}</strong>
          </article>
          <article className="metric-card">
            <span>24 小時內報告</span>
            <strong>{reports.length}</strong>
          </article>
          <article className="metric-card">
            <span>估算成本</span>
            <strong>US${totalCost.toFixed(4)}</strong>
          </article>
          <article className="metric-card">
            <span>重跑次數</span>
            <strong>{totalRegenerations}</strong>
          </article>
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
              <p className="eyebrow">Users</p>
              <h3>建立新帳號</h3>
            </div>
          </div>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setNotice("");
              try {
                await adminCreateUserAccount(createForm);
                setCreateForm({
                  email: "",
                  password: "",
                  displayName: "",
                  role: "sales",
                });
                setNotice("已建立使用者帳號。");
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "建立帳號失敗");
              }
            }}
          >
            <label className="field">
              <span>姓名</span>
              <input
                value={createForm.displayName}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, displayName: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>初始密碼</span>
              <input
                type="text"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>角色</span>
              <select
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    role: event.target.value === "admin" ? "admin" : "sales",
                  }))
                }
              >
                <option value="sales">業務</option>
                <option value="admin">管理者</option>
              </select>
            </label>
            <button className="primary-button" type="submit">
              建立帳號
            </button>
          </form>
        </article>

        <article className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">User list</p>
              <h3>帳號管理</h3>
            </div>
          </div>
          <div className="stack">
            {users.map((user) => (
              <article className="user-card" key={user.uid}>
                <div>
                  <h4>{user.displayName}</h4>
                  <p>{user.email}</p>
                  <small>{user.role === "admin" ? "管理者" : "業務"}</small>
                </div>
                <div className="stack small-stack">
                  <button
                    className="ghost-button"
                    onClick={async () => {
                      setError("");
                      setNotice("");
                      try {
                        await adminSetUserDisabled({
                          uid: user.uid,
                          disabled: !user.disabled,
                        });
                        setNotice(user.disabled ? "已啟用帳號。" : "已停用帳號。");
                      } catch (nextError) {
                        setError(nextError instanceof Error ? nextError.message : "更新帳號失敗");
                      }
                    }}
                  >
                    {user.disabled ? "啟用" : "停用"}
                  </button>
                  <div className="inline-actions">
                    <input
                      placeholder="暫時密碼"
                      value={passwordTargets[user.uid] ?? ""}
                      onChange={(event) =>
                        setPasswordTargets((current) => ({
                          ...current,
                          [user.uid]: event.target.value,
                        }))
                      }
                    />
                    <button
                      className="ghost-button"
                      onClick={async () => {
                        setError("");
                        setNotice("");
                        try {
                          await adminSetTemporaryPassword({
                            uid: user.uid,
                            password: passwordTargets[user.uid] ?? "",
                          });
                          setNotice("已更新暫時密碼。");
                          setPasswordTargets((current) => ({ ...current, [user.uid]: "" }));
                        } catch (nextError) {
                          setError(nextError instanceof Error ? nextError.message : "更新密碼失敗");
                        }
                      }}
                    >
                      設定
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Operations</p>
            <h3>報告與成本查詢</h3>
          </div>
          <div className="filter-row">
            <label className="field compact-field">
              <span>公司/業務</span>
              <input
                value={companyFilter}
                onChange={(event) => setCompanyFilter(event.target.value)}
                placeholder="輸入公司或人名"
              />
            </label>
            <label className="field compact-field">
              <span>日期</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>
            <label className="field compact-field">
              <span>狀態</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">全部</option>
                <option value="ready">完成</option>
                <option value="failed">失敗</option>
                <option value="transcribing">轉錄中</option>
                <option value="summarizing">整理中</option>
                <option value="exporting">匯出中</option>
              </select>
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>公司</th>
                <th>業務</th>
                <th>Provider</th>
                <th>狀態</th>
                <th>建立時間</th>
                <th>重跑</th>
                <th>成本</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr key={report.id}>
                  <td>{report.manualFields["公司名稱"] || "-"}</td>
                  <td>{report.ownerName}</td>
                  <td>{report.providerSnapshot.provider.toUpperCase()}</td>
                  <td>
                    <StatusPill status={report.processingStatus} />
                  </td>
                  <td>{report.createdAt?.toLocaleString("zh-TW") || "-"}</td>
                  <td>{report.regenerateCount}</td>
                  <td>US${report.usageMetrics.estimatedCostUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
