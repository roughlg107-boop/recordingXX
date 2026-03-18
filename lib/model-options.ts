import type { AiProvider } from "@/lib/ai-providers";
import { AI_PROVIDER_VALUES, getProviderLabel } from "@/lib/ai-providers";

export type ModelOption = {
  value: string;
  label: string;
  note: string;
};

export const CUSTOM_MODEL_VALUE = "__custom__";

type ProviderModelCatalog = {
  provider: AiProvider;
  providerLabel: string;
  transcription: ModelOption[];
  report: ModelOption[];
  recommendedPair: {
    transcriptionModel: string;
    reportModel: string;
    note: string;
  };
};

export const providerOptions = AI_PROVIDER_VALUES.map((provider) => ({
  value: provider,
  label: getProviderLabel(provider)
}));

export const modelCatalog: Record<AiProvider, ProviderModelCatalog> = {
  openai: {
    provider: "openai",
    providerLabel: "OpenAI",
    transcription: [
      {
        value: "gpt-4o-mini-transcribe",
        label: "gpt-4o-mini-transcribe",
        note: "推薦｜穩定、省成本"
      },
      {
        value: "gpt-4o-transcribe",
        label: "gpt-4o-transcribe",
        note: "精準優先｜成本中"
      }
    ],
    report: [
      {
        value: "gpt-4.1-mini",
        label: "gpt-4.1-mini",
        note: "推薦｜穩定、成本低"
      },
      {
        value: "gpt-5-mini",
        label: "gpt-5-mini",
        note: "推理較強｜成本低"
      },
      {
        value: "gpt-4o",
        label: "gpt-4o",
        note: "品質優先｜成本中"
      }
    ],
    recommendedPair: {
      transcriptionModel: "gpt-4o-mini-transcribe",
      reportModel: "gpt-4.1-mini",
      note: "最穩定的低成本組合"
    }
  },
  gemini: {
    provider: "gemini",
    providerLabel: "Gemini",
    transcription: [
      {
        value: "gemini-2.5-flash",
        label: "gemini-2.5-flash",
        note: "推薦｜辨識較穩"
      },
      {
        value: "gemini-2.5-flash-lite",
        label: "gemini-2.5-flash-lite",
        note: "速度快｜成本低"
      }
    ],
    report: [
      {
        value: "gemini-2.5-flash",
        label: "gemini-2.5-flash",
        note: "推薦｜平衡、穩定"
      },
      {
        value: "gemini-2.5-pro",
        label: "gemini-2.5-pro",
        note: "分析優先｜成本高"
      },
      {
        value: "gemini-2.5-flash-lite",
        label: "gemini-2.5-flash-lite",
        note: "快速整理｜成本低"
      }
    ],
    recommendedPair: {
      transcriptionModel: "gemini-2.5-flash",
      reportModel: "gemini-2.5-flash",
      note: "速度與品質最平衡"
    }
  }
};

export function getModelOptions(provider: AiProvider) {
  return modelCatalog[provider];
}

export function isRecommendedModel(options: ModelOption[], value: string) {
  return options.some((option) => option.value === value);
}
