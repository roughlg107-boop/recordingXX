"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck, Sparkles } from "lucide-react";

import type { AiProvider } from "@/lib/ai-providers";
import { getProviderKeyPlaceholder, getProviderLabel } from "@/lib/ai-providers";
import {
  readLocalProviderSettings,
  writeLocalProviderSettings,
  type LocalProviderSettings
} from "@/lib/client-settings";
import {
  CUSTOM_MODEL_VALUE,
  getModelOptions,
  isRecommendedModel,
  providerOptions
} from "@/lib/model-options";

type ValidationState =
  | { tone: "idle"; message: string }
  | { tone: "danger"; message: string }
  | { tone: "success"; message: string };

function resolveSelection(
  provider: AiProvider,
  kind: "transcription" | "report",
  value: string
) {
  const options = getModelOptions(provider)[kind];
  if (!value) {
    return "";
  }

  return isRecommendedModel(options, value) ? value : CUSTOM_MODEL_VALUE;
}

function applyProviderDefaults(provider: AiProvider, current: LocalProviderSettings): LocalProviderSettings {
  const catalog = getModelOptions(provider);
  const transcriptionModel =
    current.provider === provider && current.transcriptionModel
      ? current.transcriptionModel
      : catalog.recommendedPair.transcriptionModel;
  const reportModel =
    current.provider === provider && current.reportModel
      ? current.reportModel
      : catalog.recommendedPair.reportModel;

  return {
    provider,
    apiKey: current.provider === provider ? current.apiKey : "",
    transcriptionModel,
    reportModel
  };
}

export function SettingsForm() {
  const [settings, setSettings] = useState<LocalProviderSettings>({
    provider: "openai",
    apiKey: "",
    transcriptionModel: "",
    reportModel: ""
  });
  const [transcriptionSelection, setTranscriptionSelection] = useState("");
  const [reportSelection, setReportSelection] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [state, setState] = useState<ValidationState>({
    tone: "idle",
    message: "設定只保存在目前瀏覽器。"
  });

  useEffect(() => {
    const localSettings = readLocalProviderSettings();
    const nextSettings =
      localSettings.transcriptionModel && localSettings.reportModel
        ? localSettings
        : applyProviderDefaults(localSettings.provider, localSettings);

    setSettings(nextSettings);
    setTranscriptionSelection(
      resolveSelection(nextSettings.provider, "transcription", nextSettings.transcriptionModel)
    );
    setReportSelection(resolveSelection(nextSettings.provider, "report", nextSettings.reportModel));
  }, []);

  function updateField(field: keyof LocalProviderSettings, value: string) {
    setSettings((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateProvider(provider: AiProvider) {
    const nextSettings = applyProviderDefaults(provider, settings);
    setSettings(nextSettings);
    setTranscriptionSelection(resolveSelection(provider, "transcription", nextSettings.transcriptionModel));
    setReportSelection(resolveSelection(provider, "report", nextSettings.reportModel));
    setState({ tone: "idle", message: `${getProviderLabel(provider)} 設定只保存在目前瀏覽器。` });
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
      setState({ tone: "success", message: payload.message || "驗證成功，已保存到本機。" });
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "驗證失敗。"
      });
    } finally {
      setIsValidating(false);
    }
  }

  const catalog = getModelOptions(settings.provider);

  return (
    <div className="grid settings-grid">
      <section className="panel">
        <div className="panel-content settings-side">
          <div className="eyebrow">
            <ShieldCheck size={14} />
            本機設定
          </div>
          <h2 className="display-title">切換平台與模型</h2>
          <p className="lead compact-lead">只存這台裝置。驗證完成後，首頁會直接沿用這組設定。</p>

          <div className="compact-points">
            <div className="point-row">
              <strong>保存位置</strong>
              <span>目前瀏覽器</span>
            </div>
            <div className="point-row">
              <strong>目前平台</strong>
              <span>{getProviderLabel(settings.provider)}</span>
            </div>
            <div className="point-row">
              <strong>推薦組合</strong>
              <span>{catalog.recommendedPair.note}</span>
            </div>
          </div>

          <div className="provider-summary">
            <Sparkles size={16} />
            <div>
              <strong>{getProviderLabel(settings.provider)}</strong>
              <span>
                轉寫：{catalog.recommendedPair.transcriptionModel}
                <br />
                整理：{catalog.recommendedPair.reportModel}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-content form-panel">
          <div className="split-header form-header">
            <div>
              <div className="eyebrow">模型設定</div>
              <h3 className="section-title">平台與模型</h3>
              <p className="section-copy">先選平台，再驗證 Key 與模型。</p>
            </div>
            <Link className="secondary-button compact-button" href="/">
              返回首頁
            </Link>
          </div>

          <div className="provider-tabs" role="tablist" aria-label="AI provider">
            {providerOptions.map((option) => (
              <button
                key={option.value}
                className="provider-tab"
                data-active={settings.provider === option.value}
                type="button"
                onClick={() => updateProvider(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.value === "openai" ? "穩定熟悉" : "速度與多模態"}</span>
              </button>
            ))}
          </div>

          <div className="stack">
            <div className="field">
              <label htmlFor="apiKey">{getProviderLabel(settings.provider)} API Key</label>
              <input
                id="apiKey"
                type="password"
                autoComplete="off"
                value={settings.apiKey}
                onChange={(event) => updateField("apiKey", event.target.value)}
                placeholder={getProviderKeyPlaceholder(settings.provider)}
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="transcriptionModel">轉寫模型</label>
                <select
                  id="transcriptionModel"
                  value={transcriptionSelection}
                  onChange={(event) => updateTranscriptionSelection(event.target.value)}
                >
                  <option value="">請選擇模型</option>
                  {catalog.transcription.map((option) => (
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
                    placeholder="輸入自訂轉寫模型"
                  />
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="reportModel">整理模型</label>
                <select
                  id="reportModel"
                  value={reportSelection}
                  onChange={(event) => updateReportSelection(event.target.value)}
                >
                  <option value="">請選擇模型</option>
                  {catalog.report.map((option) => (
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
                    placeholder="輸入自訂整理模型"
                  />
                ) : null}
              </div>
            </div>

            <div className="recommend-band">
              <strong>推薦</strong>
              <span>
                {catalog.recommendedPair.transcriptionModel} + {catalog.recommendedPair.reportModel}
              </span>
            </div>

            <div className="notice" {...(state.tone !== "idle" ? { "data-tone": state.tone } : {})}>
              {state.message}
            </div>

            <div className="inline-actions">
              <button className="button wide-button" type="button" disabled={isValidating} onClick={validateSettings}>
                {isValidating ? "驗證中..." : "驗證並儲存"}
              </button>
              <button className="secondary-button wide-button" type="button" disabled={isSaving} onClick={saveLocally}>
                {isSaving ? "儲存中..." : "只儲存"}
              </button>
            </div>

            <div className="helper">
              <Check size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
              驗證成功後，首頁送件會直接使用這組設定。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
