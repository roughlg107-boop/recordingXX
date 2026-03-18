import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { GoogleGenAI, createPartFromBase64, createPartFromUri } from "@google/genai";

import { AppError } from "@/lib/errors";
import { visitReportGenerationSchema } from "@/lib/report-schema";
import { resolveAudioMimeType } from "@/lib/utils";

const GEMINI_TRANSCRIPTION_FALLBACK_MODEL = "gemini-2.5-flash";

function getClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

function createValidationWavBuffer() {
  const sampleRate = 16_000;
  const durationSeconds = 1;
  const totalSamples = sampleRate * durationSeconds;
  const bytesPerSample = 2;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const sampleValue = Math.sin(2 * Math.PI * 440 * time) * 0.08;
    buffer.writeInt16LE(Math.round(sampleValue * 32767), 44 + sampleIndex * bytesPerSample);
  }

  return buffer;
}

async function withTemporaryValidationAudio<T>(
  run: (input: { base64Data: string }) => Promise<T>
) {
  const directory = await mkdtemp(join(tmpdir(), "recordingxx-gemini-validate-"));
  const filePath = join(directory, "validation-tone.wav");

  try {
    const fileBuffer = createValidationWavBuffer();
    await writeFile(filePath, fileBuffer);
    return await run({ base64Data: fileBuffer.toString("base64") });
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function normalizeGeminiError(error: unknown): AppError {
  const rawMessage = error instanceof Error ? error.message : "Gemini 服務回傳錯誤。";
  const maybeStatus =
    typeof error === "object" && error !== null
      ? Number(
          (error as { status?: number; code?: number | string }).status ??
            (error as { status?: number; code?: number | string }).code
        ) || 400
      : 400;

  if (maybeStatus === 429 || /resource exhausted|quota|rate limit/i.test(rawMessage)) {
    return new AppError(
      "Gemini API 額度不足，或已達目前配額限制。請到 Google AI Studio / Google Cloud 檢查計費與配額。",
      400,
      "gemini_quota_exceeded"
    );
  }

  if (maybeStatus === 401 || maybeStatus === 403 || /api key|permission denied|unauthorized/i.test(rawMessage)) {
    return new AppError("Gemini API Key 無效，或目前專案沒有存取這個模型的權限。", 400, "invalid_gemini_api_key");
  }

  if (maybeStatus === 404 || /model|not found|unsupported/i.test(rawMessage)) {
    return new AppError("所選 Gemini 模型目前不可用，請改用推薦模型。", 400, "gemini_model_not_available");
  }

  if (maybeStatus >= 500) {
    return new AppError("Gemini 服務暫時異常，請稍後再試。", 502, "gemini_service_unavailable");
  }

  return new AppError(`Gemini 驗證失敗：${rawMessage}`, 400, "gemini_request_failed");
}

function parseJsonText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AppError("Gemini 沒有回傳可用內容。", 502, "empty_gemini_response");
  }

  const normalized = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

async function waitForUploadedFileActive(
  ai: GoogleGenAI,
  fileName: string,
  maxAttempts = 30
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const file = await ai.files.get({ name: fileName });
    const state = String(file.state || "");

    if (!state || state === "ACTIVE") {
      return file;
    }

    if (state === "FAILED") {
      throw new AppError("Gemini 無法處理這份音檔，請改用其他模型或較小的錄音檔。", 422, "gemini_file_processing_failed");
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new AppError("Gemini 音檔處理逾時，請稍後再試。", 504, "gemini_file_processing_timeout");
}

async function requestTranscript(
  ai: GoogleGenAI,
  model: string,
  fileUri: string,
  mimeType: string
) {
  const response = await ai.models.generateContent({
    model,
    config: {
      temperature: 0,
      maxOutputTokens: 8192
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "請將這段音檔忠實逐字轉寫為繁體中文。",
              "保留人名、店名、數字、時間與品牌名。",
              "若夾雜台語或口語，請依聽到的內容照實寫出。",
              "若完全沒有可辨識語音，請只輸出 [NO_SPEECH]。"
            ].join("\n")
          },
          createPartFromUri(fileUri, mimeType)
        ]
      }
    ]
  });

  return response.text?.trim() || "";
}

export async function validateGeminiSettings(input: {
  apiKey: string;
  transcriptionModel: string;
  reportModel: string;
}) {
  try {
    const ai = getClient(input.apiKey);

    await withTemporaryValidationAudio(async ({ base64Data }) => {
      await ai.models.generateContent({
        model: input.transcriptionModel,
        contents: [
          {
            role: "user",
            parts: [
              { text: "請只輸出 OK。" },
              createPartFromBase64(base64Data, "audio/wav")
            ]
          }
        ]
      });
    });

    await ai.models.generateContent({
      model: input.reportModel,
      contents: "請只輸出 OK。"
    });
  } catch (error) {
    throw normalizeGeminiError(error);
  }
}

export async function transcribeAudioWithGemini(input: {
  apiKey: string;
  model: string;
  filePath: string;
  mimeType: string;
  fileName?: string;
}) {
  const ai = getClient(input.apiKey);
  let uploadedFileName = "";

  try {
    const resolvedMimeType = resolveAudioMimeType(input.fileName || input.filePath, input.mimeType);
    const uploadedFile = await ai.files.upload({
      file: input.filePath,
      config: {
        mimeType: resolvedMimeType
      }
    });

    uploadedFileName = uploadedFile.name || "";
    const activeFile = uploadedFileName
      ? await waitForUploadedFileActive(ai, uploadedFileName)
      : uploadedFile;

    const fileUri = activeFile.uri || "";
    const fileMimeType = resolveAudioMimeType(
      input.fileName || input.filePath,
      activeFile.mimeType || resolvedMimeType
    );

    if (!fileUri) {
      throw new AppError("Gemini 上傳音檔失敗，未取得可處理的檔案 URI。", 502, "gemini_file_uri_missing");
    }

    let transcript = await requestTranscript(ai, input.model, fileUri, fileMimeType);

    if ((!transcript || transcript === "[NO_SPEECH]") && input.model !== GEMINI_TRANSCRIPTION_FALLBACK_MODEL) {
      transcript = await requestTranscript(ai, GEMINI_TRANSCRIPTION_FALLBACK_MODEL, fileUri, fileMimeType);
    }

    if (!transcript || transcript === "[NO_SPEECH]") {
      throw new AppError("Gemini 沒有產出逐字稿，請改用較清楚的錄音檔重試。", 422, "empty_transcript");
    }

    return transcript;
  } catch (error) {
    throw normalizeGeminiError(error);
  } finally {
    if (uploadedFileName) {
      await ai.files.delete({ name: uploadedFileName }).catch(() => undefined);
    }
  }
}

export async function generateVisitReportWithGemini(input: {
  apiKey: string;
  model: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  transcript: string;
}) {
  try {
    const ai = getClient(input.apiKey);
    const response = await ai.models.generateContent({
      model: input.model,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            summary: {
              type: "array",
              items: { type: "string" }
            },
            visitNarrative: { type: "string" },
            currentMarketingStatus: { type: "string" },
            needsAndPainPoints: {
              type: "array",
              items: { type: "string" }
            },
            goals: {
              type: "array",
              items: { type: "string" }
            },
            uncertaintyNotes: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: [
            "summary",
            "visitNarrative",
            "currentMarketingStatus",
            "needsAndPainPoints",
            "goals",
            "uncertaintyNotes"
          ]
        }
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "你是行銷公司內部的提案整理助理。",
                `店家名稱：${input.shopName}`,
                `業務姓名：${input.salesName}`,
                `拜訪日期：${input.visitDate}`,
                "",
                "請只根據逐字稿輸出結構化 JSON。",
                "要求：",
                "1. summary 列出 3 到 5 點重點。",
                "2. visitNarrative 用完整段落整理拜訪脈絡。",
                "3. currentMarketingStatus 說明店家現況。",
                "4. needsAndPainPoints 條列需求與痛點。",
                "5. goals 條列店家目標。",
                "6. uncertaintyNotes 只放未確認或有歧義的內容。",
                "7. 全部使用繁體中文，不得補造資訊。",
                "",
                input.transcript
              ].join("\n")
            }
          ]
        }
      ]
    });

    return visitReportGenerationSchema.parse(parseJsonText(response.text || ""));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && /JSON/.test(error.message)) {
      throw new AppError("Gemini 沒有產出可解析的報告格式。", 502, "invalid_gemini_report_output");
    }

    throw normalizeGeminiError(error);
  }
}
