import { randomUUID } from "crypto";

import { NextRequest } from "next/server";
import { Readable } from "stream";

import { getServerEnv } from "@/lib/env";
import { AppError, toErrorMessage } from "@/lib/errors";
import { queueReportJob } from "@/lib/report-processing";
import { reportSubmissionSchema } from "@/lib/report-schema";
import { acquireActiveJobSlot, releaseActiveJobSlot } from "@/lib/rate-limit";
import { requireClientSession } from "@/lib/session";
import { verifyUploadToken } from "@/lib/token";
import { consumeUploadSession } from "@/lib/upload-sessions";
import { assertSupportedAudio, jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let activeSlotAcquired = false;
  let reportId = "";
  let sessionHash = "";
  let queuedSuccessfully = false;

  try {
    const formData = await request.formData();
    const file = formData.get("audio");

    if (!(file instanceof File)) {
      throw new AppError("請先選擇錄音檔。", 400, "missing_audio");
    }

    const fields = reportSubmissionSchema.parse({
      shopName: formData.get("shopName"),
      salesName: formData.get("salesName"),
      visitDate: formData.get("visitDate"),
      uploadToken: formData.get("uploadToken"),
      provider: formData.get("provider"),
      apiKey: formData.get("apiKey"),
      transcriptionModel: formData.get("transcriptionModel"),
      reportModel: formData.get("reportModel")
    });

    const env = getServerEnv();
    const session = requireClientSession(request, env.rateLimitSalt);
    sessionHash = session.sessionHash;
    const tokenPayload = verifyUploadToken(fields.uploadToken, env.rateLimitSalt);

    if (tokenPayload.sessionHash !== sessionHash) {
      throw new AppError("上傳工作不屬於目前的瀏覽器工作階段。", 403, "upload_token_session_mismatch");
    }

    await consumeUploadSession({
      uploadSessionId: tokenPayload.uploadSessionId,
      sessionHash,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type
    });

    if (file.size > env.uploadMaxBytes) {
      throw new AppError("錄音檔超過目前上限，請先壓縮或分段後再上傳。", 400, "file_too_large");
    }

    assertSupportedAudio(file.name, file.type);

    reportId = randomUUID();
    await acquireActiveJobSlot(sessionHash, reportId, env.rateLimitMaxActiveJobs, env.processingLeaseMs);
    activeSlotAcquired = true;

    await queueReportJob({
      reportId,
      sessionHash,
      shopName: fields.shopName,
      salesName: fields.salesName,
      visitDate: fields.visitDate,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      stream: Readable.fromWeb(
        file.stream() as unknown as import("stream/web").ReadableStream<ArrayBufferView>
      )
    });
    queuedSuccessfully = true;

    return jsonResponse(
      {
        ok: true,
        reportId,
        status: "queued",
        redirectUrl: `/r/${reportId}`
      },
      202
    );
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError(toErrorMessage(error), 400, "report_submission_failed");

    return jsonResponse(
      {
        ok: false,
        code: appError.code,
        message: appError.message
      },
      appError.statusCode
    );
  } finally {
    if (activeSlotAcquired && reportId && sessionHash && !queuedSuccessfully) {
      await releaseActiveJobSlot(sessionHash, reportId);
    }
  }
}
