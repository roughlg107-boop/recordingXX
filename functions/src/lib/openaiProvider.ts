import fs from "node:fs";

import OpenAI from "openai";

import { parseNumberConfig } from "./config.js";
import type { UncertainItem } from "./types.js";
import { stableItemId } from "./utils.js";

interface SummarySchemaResult {
  interviewRecordAiText: string;
  uncertainItems: Array<{
    text: string;
    reason: string;
  }>;
}

interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
}

export async function transcribeAudio(options: {
  apiKey: string;
  audioPath: string;
  model: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = new OpenAI({ apiKey: options.apiKey });
  const response = await client.audio.transcriptions.create({
    model: options.model,
    file: fs.createReadStream(options.audioPath),
    response_format: "text",
    prompt:
      "這是一段台灣中文商務拜訪錄音，請忠實轉寫，不要擅自總結。品牌名、店名、電話、地址與產品名稱請盡量保留原意。",
  });

  const transcriptText =
    typeof response === "string" ? response : (response as { text?: string }).text ?? "";
  return {
    text: transcriptText.trim(),
    inputTokens: 0,
    outputTokens: 0,
  };
}

export async function summarizeToInterviewRecord(options: {
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
  const client = new OpenAI({ apiKey: options.apiKey });
  const response = await client.responses.create({
    model: options.model,
    store: false,
    instructions:
      "你是行銷公司內部的拜訪紀錄整理助理。只根據逐字稿內容輸出『訪談記錄』，不得補造不存在的資訊。若某段內容可能是業務引導、假設或無法確認是客戶真正表述，請放進 uncertainItems。訪談記錄請寫成完整中文段落摘要，語氣中性、可直接放進內部報告。",
    input: options.transcript,
    text: {
      format: {
        type: "json_schema",
        name: "visit_report_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            interviewRecordAiText: {
              type: "string",
              minLength: 1,
            },
            uncertainItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", minLength: 1 },
                  reason: { type: "string", minLength: 1 },
                },
                required: ["text", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["interviewRecordAiText", "uncertainItems"],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as SummarySchemaResult;
  const usage = (response.usage ?? {}) as UsageLike;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const inputCostPerMillion = parseNumberConfig(options.inputCostPerMillion, 2.5);
  const outputCostPerMillion = parseNumberConfig(options.outputCostPerMillion, 10);
  const summaryCostUsd =
    (inputTokens / 1_000_000) * inputCostPerMillion +
    (outputTokens / 1_000_000) * outputCostPerMillion;

  return {
    interviewRecordAiText: parsed.interviewRecordAiText.trim(),
    uncertainItems: parsed.uncertainItems.map((item, index) => ({
      id: stableItemId(item.text, index),
      text: item.text.trim(),
      reason: item.reason.trim(),
      status: "pending",
    })),
    summaryCostUsd,
    summaryInputTokens: inputTokens,
    summaryOutputTokens: outputTokens,
  };
}
