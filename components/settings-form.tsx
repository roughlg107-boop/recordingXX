"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

import {
  readLocalProviderSettings,
  writeLocalProviderSettings,
  type LocalProviderSettings
} from "@/lib/client-settings";
import {
  CUSTOM_MODEL_VALUE,
  isRecommendedModel,
  reportModelOptions,
  transcriptionModelOptions
} from "@/lib/model-options";

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
  const [transcriptionSelection, setTranscriptionSelection] = useState("");
  const [reportSelection, setReportSelection] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [state, setState] = useState<ValidationState>({
    tone: "idle",
    message: "設定只會保存在目前瀏覽器。"
  });

  useEffect(() => {
    const localSettings = readLocalProviderSettings();
    setSettings(localSettings);
    setTranscriptionSelection(
      localSettings.transcriptionModel
        ? isRecommendedModel(transcriptionModelOptions, localSettings.transcriptionModel)
          ? localSettings.transcriptionModel
          : CUSTOM_MODEL_VALUE
        : ""
    );
    setReportSelection(
      localSettings.reportModel
        ? isRecommendedModel(reportModelOptions, localSettings.reportModel)
          ? localSettings.reportModel
          : CUSTOM_MODEL_VALUE
        : ""
    );
  }, []);

  function updateField(field: keyof LocalProviderSettings, value: string) {
    setSettings((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateTranscriptionSelection(value: string) {
    setTranscriptionSelection(value);
    updateField("transcriptionModel", value === CUSTOM_MODEL_VALUE ? "" : value);
  }

  function updateReportSelection(value: string) {
    setReportSelection(value);
    updateField("reportModel", value === CUSTOM_MODEL_VALUE ? "" : value);
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
    setState({ tone: "idle", message: "正在驗證 API Key 與模型。" });

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
      setState({ tone: "success", message: payload.message || "驗證成功，已同步保存到本機。" });
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
            本機模型設定
          </div>
          <h2 className="display-title">模型與 API Key，只保存在本機瀏覽器。</h2>
          <p className="lead">這個頁面只負責本機設定，不會把 OpenAI Key 寫入系統資料庫。</p>
          <div className="stack" style={{ marginTop: 24 }}>
            <div className="notice">
              <strong>建議：</strong>
              先用個人 Key 驗證流程，再決定是否補做公司層級權限。
            </div>
            <div className="notice">
              <strong>推薦做法：</strong>
              先從下拉選單選擇推薦模型；若有特殊需求，再切換成自訂模型。
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-content">
          <div className="split-header">
            <div>
              <div className="eyebrow">連線設定</div>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>OpenAI 連線設定</h3>
            </div>
            <Link className="secondary-button" href="/">
              返回送件頁
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
              <select
                id="transcriptionModel"
                value={transcriptionSelection}
                onChange={(event) => updateTranscriptionSelection(event.target.value)}
              >
                <option value="">請選擇轉寫模型</option>
                {transcriptionModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}（{option.note}）
                  </option>
                ))}
                <option value={CUSTOM_MODEL_VALUE}>自訂模型</option>
              </select>
              {transcriptionSelection === CUSTOM_MODEL_VALUE ? (
                <input
                  value={settings.transcriptionModel}
                  onChange={(event) => updateField("transcriptionModel", event.target.value)}
                  placeholder="輸入自訂轉寫模型名稱"
                />
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="reportModel">報告整理模型</label>
              <select
                id="reportModel"
                value={reportSelection}
                onChange={(event) => updateReportSelection(event.target.value)}
              >
                <option value="">請選擇報告模型</option>
                {reportModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}（{option.note}）
                  </option>
                ))}
                <option value={CUSTOM_MODEL_VALUE}>自訂模型</option>
              </select>
              {reportSelection === CUSTOM_MODEL_VALUE ? (
                <input
                  value={settings.reportModel}
                  onChange={(event) => updateField("reportModel", event.target.value)}
                  placeholder="輸入自訂報告模型名稱"
                />
              ) : null}
            </div>

            <div className="notice" {...(state.tone !== "idle" ? { "data-tone": state.tone } : {})}>
              {state.message}
            </div>

            <div className="inline-actions">
              <button className="button" type="button" disabled={isValidating} onClick={validateSettings}>
                {isValidating ? "驗證中..." : "驗證並儲存"}
              </button>
              <button className="secondary-button" type="button" disabled={isSaving} onClick={saveLocally}>
                {isSaving ? "儲存中..." : "只儲存到本機"}
              </button>
            </div>

            <div className="helper">
              <Check size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
              驗證成功後會同步寫入本機，回到送件頁即可直接使用。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
