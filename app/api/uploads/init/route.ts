import { NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { AppError, toErrorMessage } from "@/lib/errors";
import { visitReportInputSchema } from "@/lib/report-schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getOrCreateClientSession, setClientSessionCookie } from "@/lib/session";
import { issueUploadToken } from "@/lib/token";
import { UPLOAD_SESSION_TTL_MS, UPLOAD_TOKEN_TTL_MS } from "@/lib/constants";
import { createUploadSession } from "@/lib/upload-sessions";
import { assertSupportedAudio, jsonResponse } from "@/lib/utils";

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

    const session = getOrCreateClientSession(request, env.rateLimitSalt);
    await consumeRateLimit(session.sessionHash, env.rateLimitMaxRequests, env.rateLimitWindowMs);
    const uploadSessionId = await createUploadSession({
      sessionHash: session.sessionHash,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      expiresAt: Date.now() + UPLOAD_SESSION_TTL_MS
    });

    const uploadToken = issueUploadToken(
      {
        uploadSessionId,
        sessionHash: session.sessionHash,
        expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS
      },
      env.rateLimitSalt
    );

    const response = jsonResponse({
      uploadToken,
      constraints: {
        maxBytes: env.uploadMaxBytes,
        recommendedMaxMinutes: env.uploadMaxMinutes
      }
    });

    if (session.setCookieValue) {
      setClientSessionCookie(response, session.setCookieValue);
    }

    return response;
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
