"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { ArrowRight, AudioLines, CheckCircle2, Settings2, ShieldCheck } from "lucide-react";

import { getProviderLabel } from "@/lib/ai-providers";
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
  const [settingsReady, setSettingsReady] = useState(false);
  const [providerLabel, setProviderLabel] = useState("OpenAI");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    tone: "idle",
    message: "報告保留約 24 小時。"
  });

  useEffect(() => {
    const settings = readLocalProviderSettings();
    setSettingsReady(Boolean(settings.apiKey && settings.transcriptionModel && settings.reportModel));
    setProviderLabel(getProviderLabel(settings.provider));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!audioFile) {
      setSubmitState({ tone: "danger", message: "請先選擇錄音檔。" });
      return;
    }

    const settings = readLocalProviderSettings();

    if (!settings.apiKey || !settings.transcriptionModel || !settings.reportModel) {
      setSubmitState({ tone: "danger", message: "請先完成模型設定。" });
      return;
    }

    setProviderLabel(getProviderLabel(settings.provider));
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
        throw new Error(initPayload.message || "無法初始化上傳。");
      }

      const formData = new FormData();
      formData.set("shopName", shopName);
      formData.set("salesName", salesName);
      formData.set("visitDate", visitDate);
      formData.set("uploadToken", initPayload.uploadToken);
      formData.set("provider", settings.provider);
      formData.set("apiKey", settings.apiKey);
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
        throw new Error(reportPayload.message || "送件失敗。");
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

      setSubmitState({ tone: "success", message: "已送件，正在開啟結果頁。" });
      startTransition(() => {
        router.push(reportPayload.redirectUrl!);
      });
    } catch (error) {
      setSubmitState({
        tone: "danger",
        message: error instanceof Error ? error.message : "送件失敗。"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid hero-grid">
      <section className="panel">
        <div className="panel-content hero-panel">
          <div className="eyebrow">
            <AudioLines size={14} />
            錄音整理
          </div>
          <h2 className="display-title">把拜訪錄音整理成可提案摘要</h2>
          <p className="lead compact-lead">上傳一次，輸出摘要、現況、需求與目標。</p>

          <div className="metric-grid">
            <div className="metric-card">
              <span>保存</span>
              <strong>24h</strong>
            </div>
            <div className="metric-card">
              <span>必填</span>
              <strong>3 欄位</strong>
            </div>
            <div className="metric-card">
              <span>輸出</span>
              <strong>Word</strong>
            </div>
          </div>

          <div className="step-list">
            <div className="step-card">
              <span>01</span>
              <strong>設定平台</strong>
              <p>選 OpenAI 或 Gemini。</p>
            </div>
            <div className="step-card">
              <span>02</span>
              <strong>上傳錄音</strong>
              <p>填店家、業務、日期。</p>
            </div>
            <div className="step-card">
              <span>03</span>
              <strong>下載報告</strong>
              <p>完成後直接匯出 Word。</p>
            </div>
          </div>

          <div className="quick-strip">
            <div className="quick-card">
              <ShieldCheck size={16} />
              <div>
                <strong>本機保存</strong>
                <span>Key 不寫入資料庫</span>
              </div>
            </div>
            <div className="quick-card">
              <CheckCircle2 size={16} />
              <div>
                <strong>{settingsReady ? `已就緒：${providerLabel}` : "尚未設定"}</strong>
                <span>{settingsReady ? "可直接送件" : "先完成模型設定"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-content form-panel">
          <div className="split-header form-header">
            <div>
              <div className="eyebrow">送件</div>
              <h3 className="section-title">建立報告</h3>
              <p className="section-copy">支援 m4a、mp3、wav。</p>
            </div>
            <Link className="secondary-button compact-button" href="/settings">
              <Settings2 size={16} />
              模型設定
            </Link>
          </div>

          {!settingsReady && (
            <div className="notice" data-tone="danger">
              尚未完成模型設定，請先設定平台、Key 與模型。
            </div>
          )}

          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="shopName">店家</label>
                <input
                  id="shopName"
                  value={shopName}
                  onChange={(event) => setShopName(event.target.value)}
                  placeholder="拾光餐酒館"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="salesName">業務</label>
                <input
                  id="salesName"
                  value={salesName}
                  onChange={(event) => setSalesName(event.target.value)}
                  placeholder="王小華"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="visitDate">日期</label>
              <input
                id="visitDate"
                type="date"
                value={visitDate}
                onChange={(event) => setVisitDate(event.target.value)}
                required
              />
              <div className="helper">報告將以 {formatVisitDate(visitDate)} 顯示。</div>
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
                <div className="helper">建議 90 分鐘內。原始音檔完成後即刪除。</div>
                {audioFile ? (
                  <div className="file-summary">
                    <strong>{audioFile.name}</strong>
                    <span>{(audioFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className="notice"
              {...(submitState.tone !== "idle" ? { "data-tone": submitState.tone } : {})}
            >
              {submitState.message}
            </div>

            <div className="footer-actions">
              <button className="button wide-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "送件中..." : "建立報告"}
              </button>
              <Link className="secondary-button wide-button" href="/settings">
                切換平台或模型
                <ArrowRight size={16} />
              </Link>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
