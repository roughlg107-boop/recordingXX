import { promises as fs } from "node:fs";

import { GoogleGenAI } from "@google/genai";

import { parseNumberConfig } from "./config.js";
import type { UncertainItem } from "./types.js";
import { stableItemId } from "./utils.js";

interface GeminiSummarySchemaResult {
  interviewRecordAiText: string;
  uncertainItems: Array<{
    text: string;
    reason: string;
  }>;
}

function createClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function transcribeAudioWithGemini(options: {
  apiKey: string;
  audioPath: string;
  model: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const audioBuffer = await fs.readFile(options.audioPath);
  const client = createClient(options.apiKey);
  const response = await client.models.generateContent({
    model: options.model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "請忠實逐字轉寫這段台灣中文商務拜訪錄音。不要總結，不要刪減，也不要補造任何內容。",
          },
          {
            inlineData: {
              mimeType: "audio/mpeg",
              data: audioBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
  });

  return {
    text: response.text?.trim() ?? "",
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function summarizeToInterviewRecordWithGemini(options: {
  apiKey: string;
  transcript: string;
  model: string;
  inputCostPerMillion: string;
  outputCostPerMillion: string;
}): Promise<{
  interviewRecordAiText: string;
  uncertainItems: UncertainItem[];
  summaryCostUsd: number;
  summaryInputTokens: number;
  summaryOutputTokens: number;
}> {
  const client = createClient(options.apiKey);
  const response = await client.models.generateContent({
    model: options.model,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          interviewRecordAiText: {
            type: "string",
          },
          uncertainItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                reason: { type: "string" },
              },
              required: ["text", "reason"],
            },
          },
        },
        required: ["interviewRecordAiText", "uncertainItems"],
      },
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "你是行銷公司內部的拜訪紀錄整理助理。只根據逐字稿內容輸出『訪談記錄』，不得補造不存在的資訊。若某段內容可能是業務引導、假設或無法確認是客戶真正表述，請放進 uncertainItems。訪談記錄請寫成完整中文段落摘要，語氣中性、可直接放進內部報告。",
          },
          {
            text: options.transcript,
          },
        ],
      },
    ],
  });

  const parsed = JSON.parse(response.text ?? "{}") as GeminiSummarySchemaResult;
  const usageMetadata = response.usageMetadata;
  const inputTokens = usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;
  const inputCostPerMillion = parseNumberConfig(options.inputCostPerMillion, 0.3);
  const outputCostPerMillion = parseNumberConfig(options.outputCostPerMillion, 2.5);
  return {
    interviewRecordAiText: parsed.interviewRecordAiText?.trim() ?? "",
    uncertainItems: (parsed.uncertainItems ?? []).map((item, index) => ({
      id: stableItemId(item.text, index),
      text: item.text.trim(),
      reason: item.reason.trim(),
      status: "pending",
    })),
    summaryCostUsd:
      (inputTokens / 1_000_000) * inputCostPerMillion +
      (outputTokens / 1_000_000) * outputCostPerMillion,
    summaryInputTokens: inputTokens,
    summaryOutputTokens: outputTokens,
  };
}
