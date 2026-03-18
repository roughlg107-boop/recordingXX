import type { AiProvider } from "@/lib/ai-providers";
import { generateVisitReportWithGemini, transcribeAudioWithGemini, validateGeminiSettings } from "@/lib/gemini";
import { generateVisitReport, transcribeAudio, validateOpenAiSettings } from "@/lib/openai";

export async function validateProviderSettings(input: {
  provider: AiProvider;
  apiKey: string;
  transcriptionModel: string;
  reportModel: string;
}) {
  if (input.provider === "gemini") {
    return validateGeminiSettings(input);
  }

  return validateOpenAiSettings(input);
}

export async function transcribeAudioWithProvider(input: {
  provider: AiProvider;
  apiKey: string;
  model: string;
  filePath: string;
  mimeType: string;
  fileName?: string;
}) {
  if (input.provider === "gemini") {
    return transcribeAudioWithGemini(input);
  }

  return transcribeAudio({
    apiKey: input.apiKey,
    model: input.model,
    filePath: input.filePath
  });
}

export async function generateVisitReportWithProvider(input: {
  provider: AiProvider;
  apiKey: string;
  model: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  transcript: string;
}) {
  if (input.provider === "gemini") {
    return generateVisitReportWithGemini(input);
  }

  return generateVisitReport({
    apiKey: input.apiKey,
    model: input.model,
    shopName: input.shopName,
    salesName: input.salesName,
    visitDate: input.visitDate,
    transcript: input.transcript
  });
}
