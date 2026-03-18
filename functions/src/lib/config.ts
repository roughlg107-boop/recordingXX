import { defineString } from "firebase-functions/params";

export const OPENAI_API_KEY = defineString("OPENAI_API_KEY", {
  default: "",
});
export const GEMINI_API_KEY = defineString("GEMINI_API_KEY", {
  default: "",
});
export const SETTINGS_ENCRYPTION_KEY = defineString("SETTINGS_ENCRYPTION_KEY", {
  default: "",
});
export const OPENAI_TRANSCRIBE_MODEL = defineString("OPENAI_TRANSCRIBE_MODEL", {
  default: "gpt-4o-transcribe",
});
export const OPENAI_SUMMARIZE_MODEL = defineString("OPENAI_SUMMARIZE_MODEL", {
  default: "gpt-4o",
});
export const GEMINI_TRANSCRIBE_MODEL = defineString("GEMINI_TRANSCRIBE_MODEL", {
  default: "gemini-2.5-flash",
});
export const GEMINI_SUMMARIZE_MODEL = defineString("GEMINI_SUMMARIZE_MODEL", {
  default: "gemini-2.5-flash",
});
export const OPENAI_TRANSCRIBE_COST_PER_MINUTE_USD = defineString(
  "OPENAI_TRANSCRIBE_COST_PER_MINUTE_USD",
  { default: "" },
);
export const TRANSCRIBE_COST_PER_MINUTE_USD = defineString(
  "TRANSCRIBE_COST_PER_MINUTE_USD",
  { default: "0.006" },
);
export const OPENAI_SUMMARIZE_INPUT_COST_PER_MILLION = defineString(
  "OPENAI_SUMMARIZE_INPUT_COST_PER_MILLION",
  { default: "" },
);
export const SUMMARIZE_INPUT_COST_PER_MILLION = defineString(
  "SUMMARIZE_INPUT_COST_PER_MILLION",
  { default: "2.5" },
);
export const OPENAI_SUMMARIZE_OUTPUT_COST_PER_MILLION = defineString(
  "OPENAI_SUMMARIZE_OUTPUT_COST_PER_MILLION",
  { default: "" },
);
export const SUMMARIZE_OUTPUT_COST_PER_MILLION = defineString(
  "SUMMARIZE_OUTPUT_COST_PER_MILLION",
  { default: "10" },
);
export const GEMINI_TRANSCRIBE_INPUT_COST_PER_MILLION = defineString(
  "GEMINI_TRANSCRIBE_INPUT_COST_PER_MILLION",
  { default: "0.3" },
);
export const GEMINI_TRANSCRIBE_OUTPUT_COST_PER_MILLION = defineString(
  "GEMINI_TRANSCRIBE_OUTPUT_COST_PER_MILLION",
  { default: "2.5" },
);
export const GEMINI_SUMMARIZE_INPUT_COST_PER_MILLION = defineString(
  "GEMINI_SUMMARIZE_INPUT_COST_PER_MILLION",
  { default: "0.3" },
);
export const GEMINI_SUMMARIZE_OUTPUT_COST_PER_MILLION = defineString(
  "GEMINI_SUMMARIZE_OUTPUT_COST_PER_MILLION",
  { default: "2.5" },
);
export const BOOTSTRAP_ADMIN_SECRET = defineString("BOOTSTRAP_ADMIN_SECRET", {
  default: "19mP4lJjHYHTm0ytphcb58h9OnVoGFDRVhABJ9pW",
});

export function parseNumberConfig(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
