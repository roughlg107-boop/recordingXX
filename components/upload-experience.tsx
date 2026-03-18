"use client";

import Link from "next/link";
import type { Route } from "next";
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
    message: "錄音處理完成後，報告會保留約 24 小時，之後自動失效。"
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
      setSubmitState({ tone: "danger", message: "請先到 AI 設定頁填入 API Key 與模型。" });
      return;
    }

    setIsSubmitting(true);
    setSubmitState({ tone: "idle", message: "正在建立上傳工作與排入處理..." });

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
        redirectUrl?: string;
        message?: string;
      };

      if (!reportResponse.ok || !reportPayload.redirectUrl) {
        throw new Error(reportPayload.message || "提交錄音失敗。");
      }

      setSubmitState({ tone: "success", message: "錄音已排入處理，正在前往報告頁。" });
      startTransition(() => {
        router.push(reportPayload.redirectUrl as Route);
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
            Sales Recording to Brief
          </div>
          <h2 className="display-title">把拜訪錄音，直接轉成企劃可接手的提案前置報告。</h2>
          <p className="lead">
            這個版本專注在最短流程。業務填 3 個欄位、丟入錄音，系統會整理成摘要、拜訪脈絡、行銷現況、需求痛點、目標與未確認資訊。
          </p>

          <div className="stats">
            <div className="stat">
              <strong>24h</strong>
              <span>報告留存一天</span>
            </div>
            <div className="stat">
              <strong>3 欄位</strong>
              <span>最少輸入資訊</span>
            </div>
            <div className="stat">
              <strong>Word</strong>
              <span>完成後可下載</span>
            </div>
          </div>

          <div className="notice" style={{ marginTop: 22 }}>
            <strong>使用前確認：</strong>
            API Key 與模型只存在你目前這台裝置的瀏覽器，不會被存入網站資料庫。
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-content">
          <div className="split-header">
            <div>
              <div className="eyebrow">Upload Intake</div>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>建立新報告</h3>
            </div>
            <Link className="secondary-button" href="/settings">
              <Settings2 size={16} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
              AI 設定
            </Link>
          </div>

          {!hasSettings && (
            <div className="notice" data-tone="danger" style={{ marginBottom: 18 }}>
              尚未在本機設定 OpenAI API Key 與模型。先到「AI 設定」頁完成設定，再回來上傳錄音。
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
              <div className="helper">報告會以 {formatVisitDate(visitDate)} 作為拜訪日期顯示。</div>
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
                <div className="helper">
                  支援 m4a / mp3 / wav。建議單檔控制在 90 分鐘內，處理完成後原始錄音會刪除。
                </div>
                {audioFile && (
                  <div className="notice">
                    已選擇：<strong>{audioFile.name}</strong>，約 {(audioFile.size / 1024 / 1024).toFixed(1)} MB
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
                {isSubmitting ? "提交中..." : "開始整理報告"}
              </button>
              <Link className="secondary-button" href="/settings">
                先檢查 AI 設定
                <ArrowRight size={16} style={{ verticalAlign: "text-bottom", marginLeft: 8 }} />
              </Link>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
