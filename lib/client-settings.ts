"use client";

import type { AiProvider } from "@/lib/ai-providers";

export type LocalProviderSettings = {
  provider: AiProvider;
  apiKey: string;
  transcriptionModel: string;
  reportModel: string;
};

export const LOCAL_SETTINGS_KEY = "recordingxx.ai-settings";
const LEGACY_LOCAL_SETTINGS_KEY = "recordingxx.openai-settings";

const defaultSettings: LocalProviderSettings = {
  provider: "openai",
  apiKey: "",
  transcriptionModel: "",
  reportModel: ""
};

export function readLocalProviderSettings(): LocalProviderSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  const raw =
    window.localStorage.getItem(LOCAL_SETTINGS_KEY) ||
    window.localStorage.getItem(LEGACY_LOCAL_SETTINGS_KEY);

  if (!raw) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProviderSettings> & {
      openAiApiKey?: string;
    };
    return {
      provider: parsed.provider === "gemini" ? "gemini" : "openai",
      apiKey: parsed.apiKey?.trim() || parsed.openAiApiKey?.trim() || "",
      transcriptionModel: parsed.transcriptionModel?.trim() || "",
      reportModel: parsed.reportModel?.trim() || ""
    };
  } catch {
    return defaultSettings;
  }
}

export function writeLocalProviderSettings(settings: LocalProviderSettings) {
  window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  window.localStorage.removeItem(LEGACY_LOCAL_SETTINGS_KEY);
}
