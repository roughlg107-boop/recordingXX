import { NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { AppError, toErrorMessage } from "@/lib/errors";
import { visitReportInputSchema } from "@/lib/report-schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { issueUploadToken } from "@/lib/token";
import { UPLOAD_TOKEN_TTL_MS } from "@/lib/constants";
import { assertSupportedAudio, createIpHash, getClientIp, jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const input = visitReportInputSchema.parse(await request.json());
    const env = getServerEnv();

    if (input.fileSize > env.uploadMaxBytes) {
      throw new AppError("錄音檔超過目前上限，請先壓縮或分段後再上傳。", 400, "file_too_large");
    }

    assertSupportedAudio(input.fileName, input.mimeType);

    const ipHash = createIpHash(getClientIp(request.headers), env.rateLimitSalt);
    await consumeRateLimit(ipHash, env.rateLimitMaxRequests, env.rateLimitWindowMs);

    const uploadToken = issueUploadToken(
      {
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        ipHash,
        expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS
      },
      env.rateLimitSalt
    );

    return jsonResponse({
      uploadToken,
      constraints: {
        maxBytes: env.uploadMaxBytes,
        recommendedMaxMinutes: env.uploadMaxMinutes
      }
    });
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError(toErrorMessage(error), 400, "upload_init_failed");

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
