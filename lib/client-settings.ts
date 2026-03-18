"use client";

export type LocalProviderSettings = {
  openAiApiKey: string;
  transcriptionModel: string;
  reportModel: string;
};

export const LOCAL_SETTINGS_KEY = "recordingxx.openai-settings";

export function readLocalProviderSettings(): LocalProviderSettings {
  if (typeof window === "undefined") {
    return {
      openAiApiKey: "",
      transcriptionModel: "",
      reportModel: ""
    };
  }

  const raw = window.localStorage.getItem(LOCAL_SETTINGS_KEY);

  if (!raw) {
    return {
      openAiApiKey: "",
      transcriptionModel: "",
      reportModel: ""
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProviderSettings>;
    return {
      openAiApiKey: parsed.openAiApiKey?.trim() || "",
      transcriptionModel: parsed.transcriptionModel?.trim() || "",
      reportModel: parsed.reportModel?.trim() || ""
    };
  } catch {
    return {
      openAiApiKey: "",
      transcriptionModel: "",
      reportModel: ""
    };
  }
}

export function writeLocalProviderSettings(settings: LocalProviderSettings) {
  window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
}
