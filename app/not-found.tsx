import Link from "next/link";

import { AppShell } from "@/components/app-shell";

export default function NotFound() {
  return (
    <AppShell title="找不到報告" subtitle="這份報告可能已到期，或連結不存在。">
      <section className="panel">
        <div className="panel-content">
          <div className="eyebrow">404</div>
          <h2 className="display-title" style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)" }}>
            報告不存在或已自動刪除。
          </h2>
          <p className="lead">
            系統預設只保留約 24 小時。若你還需要這份內容，請重新上傳原始錄音再次生成。
          </p>
          <div className="inline-actions" style={{ marginTop: 24 }}>
            <Link className="button" href="/">
              回到上傳頁
            </Link>
            <Link className="secondary-button" href="/settings">
              檢查 AI 設定
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
