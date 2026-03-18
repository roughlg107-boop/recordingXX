"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { ArrowRight, AudioLines, Settings2 } from "lucide-react";

import { readLocalProviderSettings } from "@/lib/client-settings";
import { formatVisitDate } from "@/lib/formatters";

type SubmitState =
  | { tone: "idle"; message: string }
  | { tone: "danger"; message: string }
  | { tone: "success"; message: string };

const today = new Date().toISOString().slice(0, 10);

export function UploadExperience() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [salesName, setSalesName] = useState("");
  const [visitDate, setVisitDate] = useState(today);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [hasSettings, setHasSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    tone: "idle",
    message: "報告建立後僅保留約 24 小時。"
  });

  useEffect(() => {
    const settings = readLocalProviderSettings();
    setHasSettings(Boolean(settings.openAiApiKey && settings.transcriptionModel && settings.reportModel));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!audioFile) {
      setSubmitState({ tone: "danger", message: "請先選擇錄音檔。" });
      return;
    }

    const settings = readLocalProviderSettings();

    if (!settings.openAiApiKey || !settings.transcriptionModel || !settings.reportModel) {
      setSubmitState({ tone: "danger", message: "請先完成模型設定。" });
      return;
    }

    setIsSubmitting(true);
    setSubmitState({ tone: "idle", message: "正在建立報告..." });

    try {
      const initResponse = await fetch("/api/uploads/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          shopName,
          salesName,
          visitDate,
          fileName: audioFile.name,
          fileSize: audioFile.size,
          mimeType: audioFile.type
        })
      });

      const initPayload = (await initResponse.json()) as {
        uploadToken?: string;
        message?: string;
      };

      if (!initResponse.ok || !initPayload.uploadToken) {
        throw new Error(initPayload.message || "無法初始化上傳工作。");
      }

      const formData = new FormData();
      formData.set("shopName", shopName);
      formData.set("salesName", salesName);
      formData.set("visitDate", visitDate);
      formData.set("uploadToken", initPayload.uploadToken);
      formData.set("openAiApiKey", settings.openAiApiKey);
      formData.set("transcriptionModel", settings.transcriptionModel);
      formData.set("reportModel", settings.reportModel);
      formData.set("audio", audioFile);

      const reportResponse = await fetch("/api/reports", {
        method: "POST",
        body: formData
      });

      const reportPayload = (await reportResponse.json()) as {
        reportId?: string;
        redirectUrl?: string;
        message?: string;
      };

      if (!reportResponse.ok || !reportPayload.redirectUrl) {
        throw new Error(reportPayload.message || "提交錄音失敗。");
      }

      if (reportPayload.reportId) {
        await fetch(`/api/reports/${reportPayload.reportId}/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(settings)
        }).catch(() => undefined);
      }

      setSubmitState({ tone: "success", message: "已送件，正在開啟報告頁。" });
      startTransition(() => {
        router.push(reportPayload.redirectUrl!);
      });
    } catch (error) {
      setSubmitState({
        tone: "danger",
        message: error instanceof Error ? error.message : "提交錄音失敗。"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid hero-grid">
      <section className="panel">
        <div className="panel-content">
          <div className="eyebrow">
            <AudioLines size={14} />
            錄音送件
          </div>
          <h2 className="display-title">上傳錄音，快速產出可交付的拜訪摘要。</h2>
          <p className="lead">輸入店家、業務與日期後，系統會整理出摘要、拜訪脈絡、現況判讀與合作重點。</p>

          <ul className="hero-points">
            <li>適合提案前快速整理客戶需求，不需要重聽全段錄音。</li>
            <li>AI 金鑰只保存在目前裝置，不寫入資料庫。</li>
            <li>報告保留一天，完成後可下載 Word。</li>
          </ul>

          <div className="stats">
            <div className="stat">
              <strong>24h</strong>
              <span>結果自動清除</span>
            </div>
            <div className="stat">
              <strong>3 欄位</strong>
              <span>快速送件</span>
            </div>
            <div className="stat">
              <strong>Word</strong>
              <span>支援匯出</span>
            </div>
          </div>

          <div className="notice" style={{ marginTop: 22 }}>
            <strong>本機設定：</strong>
            OpenAI API Key 與模型只會存在目前瀏覽器。
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-content">
          <div className="split-header">
            <div>
              <div className="eyebrow">建立報告</div>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>建立拜訪報告</h3>
            </div>
            <Link className="secondary-button" href="/settings">
              <Settings2 size={16} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
              模型設定
            </Link>
          </div>

          {!hasSettings && (
            <div className="notice" data-tone="danger" style={{ marginBottom: 18 }}>
              尚未完成本機模型設定。請先到「模型設定」頁填入 API Key 與模型。
            </div>
          )}

          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="shopName">店家名稱</label>
                <input
                  id="shopName"
                  value={shopName}
                  onChange={(event) => setShopName(event.target.value)}
                  placeholder="例如：拾光餐酒館"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="salesName">業務姓名</label>
                <input
                  id="salesName"
                  value={salesName}
                  onChange={(event) => setSalesName(event.target.value)}
                  placeholder="例如：王小華"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="visitDate">拜訪日期</label>
              <input
                id="visitDate"
                type="date"
                value={visitDate}
                onChange={(event) => setVisitDate(event.target.value)}
                required
              />
              <div className="helper">報告將以 {formatVisitDate(visitDate)} 顯示拜訪日期。</div>
            </div>

            <div className="file-field">
              <label htmlFor="audio">錄音檔</label>
              <div className="file-input-shell">
                <input
                  id="audio"
                  type="file"
                  accept=".m4a,.mp3,.wav,audio/mp4,audio/mpeg,audio/wav"
                  onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
                  required
                />
                <div className="helper">支援 m4a / mp3 / wav。建議控制在 90 分鐘內，原始音檔完成後會刪除。</div>
                {audioFile && (
                  <div className="notice">
                    已選擇：<strong>{audioFile.name}</strong>，{(audioFile.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                )}
              </div>
            </div>

            <div
              className="notice"
              {...(submitState.tone !== "idle" ? { "data-tone": submitState.tone } : {})}
            >
              {submitState.message}
            </div>

            <div className="footer-actions">
              <button className="button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "送件中..." : "建立報告"}
              </button>
              <Link className="secondary-button" href="/settings">
                前往模型設定
                <ArrowRight size={16} style={{ verticalAlign: "text-bottom", marginLeft: 8 }} />
              </Link>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
