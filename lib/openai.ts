import { createReadStream } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { AppError } from "@/lib/errors";
import { visitReportGenerationSchema } from "@/lib/report-schema";

function getClient(apiKey: string) {
  return new OpenAI({ apiKey });
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
  run: (input: { filePath: string }) => Promise<T>
) {
  const directory = await mkdtemp(join(tmpdir(), "recordingxx-validate-"));
  const filePath = join(directory, "validation-tone.wav");

  try {
    await writeFile(filePath, createValidationWavBuffer());
    return await run({ filePath });
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function normalizeOpenAiError(error: unknown): AppError {
  const statusCode =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: number }).status) || 400
      : 400;
  const rawMessage = error instanceof Error ? error.message : "OpenAI 服務回傳錯誤。";

  if (statusCode === 429 || /exceeded your current quota|insufficient_quota/i.test(rawMessage)) {
    return new AppError(
      "OpenAI API 額度不足，或已達支出上限。請到 OpenAI Billing 檢查計費與額度後再試一次。",
      400,
      "openai_quota_exceeded"
    );
  }

  if (statusCode === 401 || /invalid api key|incorrect api key/i.test(rawMessage)) {
    return new AppError("OpenAI API Key 無效，請確認目前貼上的 Key 是否正確。", 400, "invalid_api_key");
  }

  if (statusCode === 404 || /model.*does not exist|unknown model|not found/i.test(rawMessage)) {
    return new AppError("所選模型目前不可用，請改用下拉選單中的推薦模型。", 400, "model_not_available");
  }

  if (statusCode === 400) {
    return new AppError(`OpenAI 驗證失敗：${rawMessage}`, 400, "openai_bad_request");
  }

  if (statusCode >= 500) {
    return new AppError("OpenAI 服務暫時異常，請稍後再試。", 502, "openai_service_unavailable");
  }

  return new AppError(rawMessage, 400, "openai_request_failed");
}

export async function validateOpenAiSettings(input: {
  apiKey: string;
  transcriptionModel: string;
  reportModel: string;
}) {
  try {
    const client = getClient(input.apiKey);

    await withTemporaryValidationAudio(async ({ filePath }) => {
      await client.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: input.transcriptionModel,
        response_format: "text",
        prompt: "This is a model capability validation request."
      });
    });
    await client.chat.completions.create({
      model: input.reportModel,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Reply with structured output only."
        },
        {
          role: "user",
          content: "Return OK."
        }
      ],
      max_tokens: 12
    });
  } catch (error) {
    throw normalizeOpenAiError(error);
  }
}

export async function transcribeAudio(input: {
  apiKey: string;
  model: string;
  filePath: string;
}) {
  let transcript = "";

  try {
    const client = getClient(input.apiKey);

    transcript = await client.audio.transcriptions.create({
      file: createReadStream(input.filePath),
      model: input.model,
      response_format: "text",
      prompt:
        "The audio is a sales visit in Traditional Chinese and may include Taiwanese Hokkien. Keep names, brand names, and numbers faithful."
    });
  } catch (error) {
    throw normalizeOpenAiError(error);
  }

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
  let completion;

  try {
    const client = getClient(input.apiKey);

    completion = await client.chat.completions.parse({
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
  } catch (error) {
    throw normalizeOpenAiError(error);
  }

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new AppError("AI 沒有產出可用的拜訪報告。", 502, "invalid_report_output");
  }

  return parsed;
}
