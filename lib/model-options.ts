export type ModelOption = {
  value: string;
  label: string;
  note: string;
};

export const CUSTOM_MODEL_VALUE = "__custom__";

export const transcriptionModelOptions: ModelOption[] = [
  {
    value: "gpt-4o-mini-transcribe",
    label: "gpt-4o-mini-transcribe",
    note: "推薦｜效果佳、成本低"
  },
  {
    value: "gpt-4o-transcribe",
    label: "gpt-4o-transcribe",
    note: "精準優先｜效果高、成本中"
  }
];

export const reportModelOptions: ModelOption[] = [
  {
    value: "gpt-5-mini",
    label: "gpt-5-mini",
    note: "推薦｜效果佳、成本低"
  },
  {
    value: "gpt-4.1-mini",
    label: "gpt-4.1-mini",
    note: "穩定實用｜效果佳、成本低"
  },
  {
    value: "gpt-4o",
    label: "gpt-4o",
    note: "品質優先｜效果高、成本中"
  },
  {
    value: "gpt-5.4",
    label: "gpt-5.4",
    note: "旗艦分析｜效果最佳、成本高"
  }
];

export function isRecommendedModel(options: ModelOption[], value: string) {
  return options.some((option) => option.value === value);
}
