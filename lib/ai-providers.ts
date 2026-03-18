export const AI_PROVIDER_VALUES = ["openai", "gemini"] as const;

export type AiProvider = (typeof AI_PROVIDER_VALUES)[number];

export function getProviderLabel(provider: AiProvider) {
  return provider === "openai" ? "OpenAI" : "Gemini";
}

export function getProviderKeyPlaceholder(provider: AiProvider) {
  return provider === "openai" ? "sk-..." : "AIza...";
}
