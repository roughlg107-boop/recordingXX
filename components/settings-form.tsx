"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

import {
  readLocalProviderSettings,
  writeLocalProviderSettings,
  type LocalProviderSettings
} from "@/lib/client-settings";

type ValidationState =
  | { tone: "idle"; message: string }
  | { tone: "danger"; message: string }
  | { tone: "success"; message: string };

export function SettingsForm() {
  const [settings, setSettings] = useState<LocalProviderSettings>({
    openAiApiKey: "",
    transcriptionModel: "",
    reportModel: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [state, setState] = useState<ValidationState>({
    tone: "idle",
    message: "這些設定只會保存在你目前這台裝置的瀏覽器。"
  });

  useEffect(() => {
    setSettings(readLocalProviderSettings());
  }, []);

  function updateField(field: keyof LocalProviderSettings, value: string) {
    setSettings((current) => ({
      ...current,
      [field]: value
    }));
  }

  function saveLocally() {
    setIsSaving(true);

    try {
      writeLocalProviderSettings(settings);
      setState({ tone: "success", message: "設定已保存到目前瀏覽器。" });
    } finally {
      setIsSaving(false);
    }
  }

  async function validateSettings() {
    setIsValidating(true);
    setState({ tone: "idle", message: "正在驗證 API Key 與模型..." });

    try {
      const response = await fetch("/api/provider/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message || "驗證失敗。");
      }

      writeLocalProviderSettings(settings);
      setState({ tone: "success", message: payload.message || "驗證成功，並已保存到本機。" });
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "驗證失敗。"
      });
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <div className="grid hero-grid" style={{ gridTemplateColumns: "0.95fr 1.05fr" }}>
      <section className="panel">
        <div className="panel-content">
          <div className="eyebrow">
            <ShieldCheck size={14} />
            Local Browser Settings
          </div>
          <h2 className="display-title">API Key 與模型，只保留在使用者自己的瀏覽器。</h2>
          <p className="lead">
            這個網站不預設任何 AI 供應商設定，也不會把你的 OpenAI API Key 存進資料庫。每位使用者都要自行設定。
          </p>
          <div className="stack" style={{ marginTop: 24 }}>
            <div className="notice">
              <strong>建議做法：</strong>
              先用自己的 Key 測試流程，確認品質後，再決定公司是否要進一步做受保護的管理者設定頁。
            </div>
            <div className="notice">
              <strong>模型欄位目前不預填：</strong>
              你可以自行輸入，例如轉寫模型常見會填 <code>gpt-4o-mini-transcribe</code>。
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-content">
          <div className="split-header">
            <div>
              <div className="eyebrow">Provider Settings</div>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>OpenAI 設定</h3>
            </div>
            <Link className="secondary-button" href="/">
              回上傳頁
            </Link>
          </div>

          <div className="stack">
            <div className="field">
              <label htmlFor="openAiApiKey">OpenAI API Key</label>
              <input
                id="openAiApiKey"
                type="password"
                autoComplete="off"
                value={settings.openAiApiKey}
                onChange={(event) => updateField("openAiApiKey", event.target.value)}
                placeholder="sk-..."
              />
            </div>

            <div className="field">
              <label htmlFor="transcriptionModel">轉寫模型</label>
              <input
                id="transcriptionModel"
                value={settings.transcriptionModel}
                onChange={(event) => updateField("transcriptionModel", event.target.value)}
                placeholder="例如：gpt-4o-mini-transcribe"
              />
            </div>

            <div className="field">
              <label htmlFor="reportModel">報告整理模型</label>
              <input
                id="reportModel"
                value={settings.reportModel}
                onChange={(event) => updateField("reportModel", event.target.value)}
                placeholder="例如：gpt-4.1-mini"
              />
            </div>

            <div className="notice" {...(state.tone !== "idle" ? { "data-tone": state.tone } : {})}>
              {state.message}
            </div>

            <div className="inline-actions">
              <button className="button" type="button" disabled={isValidating} onClick={validateSettings}>
                {isValidating ? "驗證中..." : "驗證並保存"}
              </button>
              <button className="secondary-button" type="button" disabled={isSaving} onClick={saveLocally}>
                {isSaving ? "保存中..." : "只保存到本機"}
              </button>
            </div>

            <div className="helper">
              <Check size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
              驗證成功後會一併保存到本機，之後回上傳頁就能直接使用。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
