import { useEffect, useMemo, useState } from "react";

import { getAiSettings, saveAiProviderSettings } from "../api";
import { createDefaultAiSettings, type AiProvider, type AiSettingsPayload } from "../types";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const providerLabels: Record<AiProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

const providerHints: Record<AiProvider, string> = {
  openai: "適合沿用目前的 OpenAI 轉錄與 JSON schema 摘要流程。",
  gemini: "適合想以 Gemini 模型統一轉錄與摘要，設定由後端安全保存。",
};

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AiSettingsPayload>(createDefaultAiSettings());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    void getAiSettings()
      .then((payload) => {
        setSettings(payload);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "讀取設定失敗");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  const activeProvider = useMemo(() => settings.activeProvider, [settings.activeProvider]);
  const activeProviderHasApiKey = useMemo(() => {
    const config = settings.providers[activeProvider];
    return Boolean(config.apiKey.trim() || config.hasApiKey);
  }, [activeProvider, settings.providers]);
  const hasBlankModel = useMemo(() => {
    return (["openai", "gemini"] as AiProvider[]).some((provider) => {
      const config = settings.providers[provider];
      return !config.transcriptModel.trim() || !config.summaryModel.trim();
    });
  }, [settings.providers]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className="settings-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="settings-header">
          <div>
            <p className="eyebrow">AI Settings</p>
            <h3>API key 與模型選擇</h3>
            <p className="subtle-text">
              在這裡切換目前的 AI provider。API key 會由後端加密後保存。
            </p>
          </div>
          <button className="ghost-button" onClick={onClose}>
            關閉
          </button>
        </div>

        {loading ? (
          <div className="settings-loading">讀取設定中...</div>
        ) : (
          <>
            <div className="provider-switch-grid">
              {(["openai", "gemini"] as AiProvider[]).map((provider) => (
                <button
                  key={provider}
                  className={`provider-tile ${activeProvider === provider ? "is-selected" : ""}`}
                  onClick={() => setSettings((current) => ({ ...current, activeProvider: provider }))}
                >
                  <div>
                    <strong>{providerLabels[provider]}</strong>
                    <p>{providerHints[provider]}</p>
                  </div>
                  <span className="provider-chip">
                    {activeProvider === provider ? "目前啟用" : "可切換"}
                  </span>
                </button>
              ))}
            </div>

            <div className="settings-provider-grid">
              {(["openai", "gemini"] as AiProvider[]).map((provider) => {
                const config = settings.providers[provider];
                return (
                  <article className="provider-config-card" key={provider}>
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">{providerLabels[provider]}</p>
                        <h4>{provider === activeProvider ? "目前主供應商" : "備用供應商"}</h4>
                      </div>
                      <span className="subtle-text">
                        {config.hasApiKey
                          ? `已儲存 ${config.apiKeyPreview || "masked key"}`
                          : "尚未儲存 key"}
                      </span>
                    </div>

                    <div className="stack">
                      <label className="field">
                        <span>API Key</span>
                        <input
                          type="password"
                          placeholder={config.hasApiKey ? "留空可保留既有 key" : "貼上新的 API key"}
                          value={config.apiKey}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              providers: {
                                ...current.providers,
                                [provider]: {
                                  ...current.providers[provider],
                                  apiKey: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>轉錄模型</span>
                        <input
                          value={config.transcriptModel}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              providers: {
                                ...current.providers,
                                [provider]: {
                                  ...current.providers[provider],
                                  transcriptModel: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>摘要模型</span>
                        <input
                          value={config.summaryModel}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              providers: {
                                ...current.providers,
                                [provider]: {
                                  ...current.providers[provider],
                                  summaryModel: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {(notice || error) && (
          <div className="settings-feedback">
            {notice && <p className="success-text">{notice}</p>}
            {error && <p className="error-text">{error}</p>}
          </div>
        )}
        {!activeProviderHasApiKey && (
          <div className="settings-feedback">
            <p className="error-text">目前啟用的 provider 尚未設定可用 API key，無法儲存。</p>
          </div>
        )}
        {hasBlankModel && (
          <div className="settings-feedback">
            <p className="error-text">轉錄模型與摘要模型不可留空。</p>
          </div>
        )}

        <div className="settings-footer">
          <p className="subtle-text">留空 API key 代表保留既有 key；模型名稱可依需求自由調整。</p>
          <button
            className="primary-button"
            disabled={loading || saving || !activeProviderHasApiKey || hasBlankModel}
            onClick={async () => {
              setSaving(true);
              setError("");
              setNotice("");
              try {
                const nextPayload = await saveAiProviderSettings(settings);
                setSettings(nextPayload);
                setNotice("AI 設定已更新。");
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "儲存設定失敗");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "儲存中..." : "儲存設定"}
          </button>
        </div>
      </section>
    </div>
  );
}
