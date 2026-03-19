import { Activity, Mail, ShieldCheck } from "lucide-react";

import { formatDisplayDate, formatReportActivityAction } from "@/lib/formatters";
import type { RecentReportActivityRecord } from "@/lib/types";

export function SettingsActivityPanel({
  currentUserLabel,
  recentActivities
}: {
  currentUserLabel: string;
  recentActivities: RecentReportActivityRecord[];
}) {
  return (
    <section className="panel">
      <div className="panel-content form-panel">
        <div className="split-header form-header">
          <div>
            <div className="eyebrow">
              <Activity size={14} />
              系統操作紀錄
            </div>
            <h3 className="section-title">最近誰做了什麼</h3>
            <p className="section-copy">顯示近期報告操作與登入信箱。</p>
          </div>
        </div>

        <div className="settings-audit-summary">
          <div className="quick-card">
            <Mail size={16} />
            <div>
              <strong>目前登入</strong>
              <span>{currentUserLabel}</span>
            </div>
          </div>
          <div className="quick-card">
            <ShieldCheck size={16} />
            <div>
              <strong>目前記錄</strong>
              <span>建立報告、啟動處理、完成/失敗、下載 Word</span>
            </div>
          </div>
        </div>

        {recentActivities.length ? (
          <ul className="activity-list">
            {recentActivities.map((item) => (
              <li key={item.id}>
                <strong>{item.actorEmail || item.actorLabel}</strong>
                <span>
                  {formatReportActivityAction(item.action)} · {formatDisplayDate(item.createdAt)}
                </span>
                <p>
                  店家：{item.shopName}
                  {item.detail ? ` · ${item.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="notice">目前還沒有可顯示的操作紀錄。</div>
        )}
      </div>
    </section>
  );
}
