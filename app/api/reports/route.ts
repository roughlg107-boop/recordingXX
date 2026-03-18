import { after } from "next/server";
import { NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { AppError, toErrorMessage } from "@/lib/errors";
import { processReportJob, queueReportJob } from "@/lib/report-processing";
import { reportSubmissionSchema } from "@/lib/report-schema";
import { acquireActiveJobSlot, releaseActiveJobSlot } from "@/lib/rate-limit";
import { verifyUploadToken } from "@/lib/token";
import { assertSupportedAudio, createIpHash, getClientIp, jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let activeSlotAcquired = false;
  let queuedReportId = "";
  let ipHash = "";

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
      openAiApiKey: formData.get("openAiApiKey"),
      transcriptionModel: formData.get("transcriptionModel"),
      reportModel: formData.get("reportModel")
    });

    const env = getServerEnv();
    ipHash = createIpHash(getClientIp(request.headers), env.rateLimitSalt);
    const tokenPayload = verifyUploadToken(fields.uploadToken, env.rateLimitSalt);

    if (tokenPayload.ipHash !== ipHash) {
      throw new AppError("上傳工作不屬於目前的使用者。", 403, "upload_token_ip_mismatch");
    }

    if (file.size !== tokenPayload.fileSize || file.name !== tokenPayload.fileName) {
      throw new AppError("錄音檔與初始化資訊不一致，請重新上傳。", 400, "upload_mismatch");
    }

    if (file.size > env.uploadMaxBytes) {
      throw new AppError("錄音檔超過目前上限，請先壓縮或分段後再上傳。", 400, "file_too_large");
    }

    assertSupportedAudio(file.name, file.type);

    await acquireActiveJobSlot(ipHash, env.rateLimitMaxActiveJobs);
    activeSlotAcquired = true;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { reportId, objectPath } = await queueReportJob({
      ipHash,
      shopName: fields.shopName,
      salesName: fields.salesName,
      visitDate: fields.visitDate,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      openAiApiKey: fields.openAiApiKey,
      transcriptionModel: fields.transcriptionModel,
      reportModel: fields.reportModel
    });
    queuedReportId = reportId;

    after(async () => {
      await processReportJob({
        reportId,
        objectPath,
        ipHash,
        shopName: fields.shopName,
        salesName: fields.salesName,
        visitDate: fields.visitDate,
        fileName: file.name,
        mimeType: file.type,
        openAiApiKey: fields.openAiApiKey,
        transcriptionModel: fields.transcriptionModel,
        reportModel: fields.reportModel
      });
    });

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
    if (activeSlotAcquired && !queuedReportId) {
      await releaseActiveJobSlot(ipHash);
    }
  }
}
