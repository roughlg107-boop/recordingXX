import { NextRequest } from "next/server";

import { providerValidationSchema } from "@/lib/report-schema";
import { validateProviderSettings } from "@/lib/ai-provider";
import { AppError, toErrorMessage } from "@/lib/errors";
import { jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const payload = providerValidationSchema.parse(await request.json());
    await validateProviderSettings(payload);
    return jsonResponse({
      ok: true,
      message: "API Key 與模型驗證成功。"
    });
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(toErrorMessage(error), 400, "provider_validation_failed");

    return jsonResponse(
      {
        ok: false,
        code: appError.code,
        message: appError.message
      },
      appError.statusCode
    );
  }
}
