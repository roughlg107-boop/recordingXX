import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { AppError } from "@/lib/errors";
import { visitReportGenerationSchema } from "@/lib/report-schema";

function getClient(apiKey: string) {
  return new OpenAI({ apiKey });
}

export async function validateOpenAiSettings(input: {
  openAiApiKey: string;
  transcriptionModel: string;
  reportModel: string;
}) {
  const client = getClient(input.openAiApiKey);

  await client.models.retrieve(input.transcriptionModel);
  await client.responses.create({
    model: input.reportModel,
    input: "Respond with OK.",
    max_output_tokens: 12
  });
}

export async function transcribeAudio(input: {
  apiKey: string;
  model: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const client = getClient(input.apiKey);

  const file = new File([new Uint8Array(input.buffer)], input.fileName, {
    type: input.mimeType || "application/octet-stream"
  });

  const transcript = await client.audio.transcriptions.create({
    file,
    model: input.model,
    response_format: "text",
    prompt:
      "The audio is a sales visit in Traditional Chinese and may include Taiwanese Hokkien. Keep names, brand names, and numbers faithful."
  });

  if (!transcript.trim()) {
    throw new AppError("語音辨識沒有產出內容，請改用較清楚的錄音檔重試。", 422, "empty_transcript");
  }

  return transcript;
}

export async function generateVisitReport(input: {
  apiKey: string;
  model: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  transcript: string;
}) {
  const client = getClient(input.apiKey);

  const completion = await client.chat.completions.parse({
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an operations analyst for a marketing agency. Read a sales visit transcript and produce a factual Traditional Chinese report for internal proposal preparation. Never invent details. When information is ambiguous, put the uncertainty into uncertaintyNotes instead of guessing."
      },
      {
        role: "user",
        content: [
          `店家名稱：${input.shopName}`,
          `業務姓名：${input.salesName}`,
          `拜訪日期：${input.visitDate}`,
          "",
          "請根據以下逐字稿輸出結構化報告。",
          "要求：",
          "1. summary 請列出 3 到 5 點最重要重點。",
          "2. visitNarrative 用完整段落整理拜訪脈絡。",
          "3. currentMarketingStatus 說明店家目前行銷現況。",
          "4. needsAndPainPoints 條列需求與痛點。",
          "5. goals 條列店家希望達成的目標。",
          "6. uncertaintyNotes 只放未確認、不清楚或有歧義的資訊。",
          "7. 全部使用繁體中文。",
          "",
          input.transcript
        ].join("\n")
      }
    ],
    response_format: zodResponseFormat(visitReportGenerationSchema, "visit_report")
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new AppError("AI 沒有產出可用的拜訪報告。", 502, "invalid_report_output");
  }

  return parsed;
}
