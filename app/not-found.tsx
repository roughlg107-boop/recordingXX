import Link from "next/link";

import { AppShell } from "@/components/app-shell";

export default function NotFound() {
  return (
    <AppShell title="找不到報告" subtitle="連結失效或報告已清除。">
      <section className="panel">
        <div className="panel-content">
          <div className="eyebrow">404</div>
          <h2 className="display-title" style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)" }}>
            這份報告已失效。
          </h2>
          <p className="lead">系統只保留短期工作檔。若仍需內容，請重新上傳原始錄音。</p>
          <div className="inline-actions" style={{ marginTop: 24 }}>
            <Link className="button" href="/">
              建立新報告
            </Link>
            <Link className="secondary-button" href="/settings">
              檢查模型設定
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
