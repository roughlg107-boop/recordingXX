import { useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth";

export function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="login-shell">
      <section className="login-hero">
        <p className="eyebrow">Mobile-first workflow</p>
        <h2>錄音進站後，五分鐘內整理成可交接的拜訪報告</h2>
        <p>
          這個系統把拜訪錄音轉成可人工確認的訪談記錄，讓業務補齊欄位後直接匯出 Word。
        </p>
        <ul className="feature-list">
          <li>上傳既有音檔即可開始處理</li>
          <li>AI 只整理訪談記錄，其餘欄位由人工補</li>
          <li>24 小時後自動清理暫存資料</li>
        </ul>
      </section>

      <section className="login-card">
        <div>
          <p className="eyebrow">Sign in</p>
          <h3>使用公司帳號登入</h3>
        </div>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError("");
            try {
              await signIn(email, password);
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "登入失敗");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
            />
          </label>

          <label className="field">
            <span>密碼</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="輸入密碼"
              required
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "登入中..." : "登入"}
          </button>
        </form>
      </section>
    </main>
  );
}
