import { FieldValue } from "firebase-admin/firestore";

import {
  GEMINI_API_KEY,
  GEMINI_SUMMARIZE_MODEL,
  GEMINI_TRANSCRIBE_MODEL,
  OPENAI_API_KEY,
  OPENAI_SUMMARIZE_MODEL,
  OPENAI_TRANSCRIBE_MODEL,
  SETTINGS_ENCRYPTION_KEY,
} from "./config.js";
import { decryptSecret, encryptSecret, maskApiKey } from "./crypto.js";
import { db } from "./firebaseAdmin.js";
import type {
  AiProvider,
  AiSettingsDocument,
  AiSettingsPayload,
  ProviderSnapshot,
  ProviderStoredConfig,
} from "./types.js";

const SETTINGS_COLLECTION = "appSettings";
const AI_SETTINGS_DOC = "ai";

function buildDefaultStoredConfig(
  provider: AiProvider,
): ProviderStoredConfig {
  return {
    apiKeyCiphertext: "",
    apiKeyPreview: "",
    transcriptModel:
      provider === "openai" ? OPENAI_TRANSCRIBE_MODEL.value() : GEMINI_TRANSCRIBE_MODEL.value(),
    summaryModel:
      provider === "openai" ? OPENAI_SUMMARIZE_MODEL.value() : GEMINI_SUMMARIZE_MODEL.value(),
  };
}

function buildDefaultPayload(): AiSettingsPayload {
  return {
    activeProvider: "openai",
    providers: {
      openai: {
        apiKey: "",
        apiKeyPreview: maskApiKey(OPENAI_API_KEY.value()),
        transcriptModel: OPENAI_TRANSCRIBE_MODEL.value(),
        summaryModel: OPENAI_SUMMARIZE_MODEL.value(),
        hasApiKey: Boolean(OPENAI_API_KEY.value()),
      },
      gemini: {
        apiKey: "",
        apiKeyPreview: maskApiKey(GEMINI_API_KEY.value()),
        transcriptModel: GEMINI_TRANSCRIBE_MODEL.value(),
        summaryModel: GEMINI_SUMMARIZE_MODEL.value(),
        hasApiKey: Boolean(GEMINI_API_KEY.value()),
      },
    },
  };
}

export async function getStoredAiSettings(): Promise<AiSettingsDocument | null> {
  const snapshot = await db.collection(SETTINGS_COLLECTION).doc(AI_SETTINGS_DOC).get();
  return snapshot.exists ? (snapshot.data() as AiSettingsDocument) : null;
}

export async function getAiSettingsPayload(): Promise<AiSettingsPayload> {
  const stored = await getStoredAiSettings();
  const defaults = buildDefaultPayload();
  if (!stored) {
    return defaults;
  }

  const openaiConfig = stored.providers?.openai ?? buildDefaultStoredConfig("openai");
  const geminiConfig = stored.providers?.gemini ?? buildDefaultStoredConfig("gemini");

  return {
    activeProvider: stored.activeProvider,
    providers: {
      openai: {
        apiKey: "",
        apiKeyPreview: openaiConfig.apiKeyPreview || defaults.providers.openai.apiKeyPreview,
        transcriptModel: openaiConfig.transcriptModel || defaults.providers.openai.transcriptModel,
        summaryModel: openaiConfig.summaryModel || defaults.providers.openai.summaryModel,
        hasApiKey: hasUsableProviderApiKey("openai", openaiConfig),
      },
      gemini: {
        apiKey: "",
        apiKeyPreview: geminiConfig.apiKeyPreview || defaults.providers.gemini.apiKeyPreview,
        transcriptModel: geminiConfig.transcriptModel || defaults.providers.gemini.transcriptModel,
        summaryModel: geminiConfig.summaryModel || defaults.providers.gemini.summaryModel,
        hasApiKey: hasUsableProviderApiKey("gemini", geminiConfig),
      },
    },
  };
}

export async function saveAiSettings(options: {
  activeProvider: AiProvider;
  providers: AiSettingsPayload["providers"];
  updatedByUid: string;
  updatedByName: string;
}): Promise<void> {
  const existing = (await getStoredAiSettings()) ?? {
    activeProvider: "openai" as const,
    providers: {
      openai: buildDefaultStoredConfig("openai"),
      gemini: buildDefaultStoredConfig("gemini"),
    },
  };
  const encryptionSecret = SETTINGS_ENCRYPTION_KEY.value();

  const nextProviders = (["openai", "gemini"] as AiProvider[]).reduce<
    Record<AiProvider, ProviderStoredConfig>
  >((accumulator, provider) => {
    const submitted = options.providers[provider];
    const previous = existing.providers[provider] ?? buildDefaultStoredConfig(provider);
    const transcriptModel = normalizeModelName(submitted.transcriptModel, provider, "轉錄模型");
    const summaryModel = normalizeModelName(submitted.summaryModel, provider, "摘要模型");
    let apiKeyCiphertext = previous.apiKeyCiphertext ?? "";
    let apiKeyPreview = previous.apiKeyPreview ?? "";

    if (submitted.apiKey.trim()) {
      if (!encryptionSecret) {
        throw new Error("SETTINGS_ENCRYPTION_KEY 尚未設定，無法儲存 API key。");
      }
      apiKeyCiphertext = encryptSecret(encryptionSecret, submitted.apiKey.trim());
      apiKeyPreview = maskApiKey(submitted.apiKey.trim());
    }

    if (options.activeProvider === provider && !resolveEffectiveApiKey(provider, submitted.apiKey, previous)) {
      throw new Error(`${getProviderLabel(provider)} API key 尚未設定，無法啟用。`);
    }

    accumulator[provider] = {
      apiKeyCiphertext,
      apiKeyPreview,
      transcriptModel,
      summaryModel,
    };
    return accumulator;
  }, {
    openai: buildDefaultStoredConfig("openai"),
    gemini: buildDefaultStoredConfig("gemini"),
  });

  await db.collection(SETTINGS_COLLECTION).doc(AI_SETTINGS_DOC).set(
    {
      activeProvider: options.activeProvider,
      providers: nextProviders,
      updatedByUid: options.updatedByUid,
      updatedByName: options.updatedByName,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function resolveProviderSnapshot(): Promise<ProviderSnapshot> {
  const stored = await getStoredAiSettings();
  const active = stored?.activeProvider ?? "openai";
  const activeConfig = stored?.providers?.[active] ?? buildDefaultStoredConfig(active);
  return {
    provider: active,
    transcriptModel: activeConfig.transcriptModel,
    summaryModel: activeConfig.summaryModel,
  };
}

export async function resolveRuntimeProviderConfig(snapshot?: ProviderSnapshot): Promise<{
  provider: AiProvider;
  apiKey: string;
  transcriptModel: string;
  summaryModel: string;
}> {
  const settings = await getStoredAiSettings();
  const provider = snapshot?.provider ?? settings?.activeProvider ?? "openai";
  const defaults = buildDefaultPayload().providers[provider];
  const storedProvider = settings?.providers[provider];
  const encryptionSecret = SETTINGS_ENCRYPTION_KEY.value();

  const decryptedKey =
    storedProvider?.apiKeyCiphertext && encryptionSecret
      ? decryptSecret(encryptionSecret, storedProvider.apiKeyCiphertext)
      : "";
  const apiKey =
    decryptedKey || (provider === "openai" ? OPENAI_API_KEY.value() : GEMINI_API_KEY.value());

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()} API key 尚未設定。`);
  }

  return {
    provider,
    apiKey,
    transcriptModel:
      snapshot?.transcriptModel || storedProvider?.transcriptModel || defaults.transcriptModel,
    summaryModel:
      snapshot?.summaryModel || storedProvider?.summaryModel || defaults.summaryModel,
  };
}

function getProviderLabel(provider: AiProvider): string {
  return provider === "openai" ? "OpenAI" : "Gemini";
}

function normalizeModelName(model: string, provider: AiProvider, fieldLabel: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    throw new Error(`${getProviderLabel(provider)} ${fieldLabel}不可留空。`);
  }
  return trimmed;
}

function hasUsableProviderApiKey(
  provider: AiProvider,
  storedProvider: ProviderStoredConfig,
): boolean {
  return Boolean(resolveEffectiveApiKey(provider, "", storedProvider));
}

function resolveEffectiveApiKey(
  provider: AiProvider,
  submittedApiKey: string,
  storedProvider: ProviderStoredConfig,
): string {
  const directKey = submittedApiKey.trim();
  if (directKey) {
    return directKey;
  }

  const encryptionSecret = SETTINGS_ENCRYPTION_KEY.value();
  const decryptedStoredKey =
    storedProvider.apiKeyCiphertext && encryptionSecret
      ? decryptSecret(encryptionSecret, storedProvider.apiKeyCiphertext)
      : "";

  return decryptedStoredKey || (provider === "openai" ? OPENAI_API_KEY.value() : GEMINI_API_KEY.value());
}
