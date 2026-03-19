import { after, NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { AppError, toErrorMessage } from "@/lib/errors";
import { requireAuthenticatedRequest } from "@/lib/firebase-auth";
import {
  appendReportActivity,
  claimReportForProcessing,
  getReportStatus
} from "@/lib/firestore-reports";
import { processReportJob } from "@/lib/report-processing";
import { providerValidationSchema } from "@/lib/report-schema";
import { requireClientSession } from "@/lib/session";
import { jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await context.params;
    const authUser = await requireAuthenticatedRequest(request);
    const env = getServerEnv();
    const session = requireClientSession(request, env.rateLimitSalt);
    const payload = providerValidationSchema.parse(await request.json());
    const claim = await claimReportForProcessing(
      reportId,
      {
        sessionHash: session.sessionHash,
        ownerUid: authUser.uid
      },
      env.processingLeaseMs
    );

    if (!claim) {
      const report = await getReportStatus(reportId, {
        sessionHash: session.sessionHash,
        ownerUid: authUser.uid
      });

      if (!report) {
        throw new AppError("找不到這份報告，可能已到期。", 404, "report_not_found");
      }

      return jsonResponse({ ok: true, report });
    }

    await appendReportActivity(reportId, {
      action: "processing_started",
      actorUid: authUser.uid,
      actorEmail: authUser.email || undefined,
      actorLabel: authUser.email || authUser.uid,
      detail: "啟動錄音整理"
    });

    after(async () => {
      await processReportJob({
        claim,
        provider: payload.provider,
        apiKey: payload.apiKey,
        transcriptionModel: payload.transcriptionModel,
        reportModel: payload.reportModel,
        processingLeaseMs: env.processingLeaseMs,
        processingHeartbeatMs: env.processingHeartbeatMs
      });
    });

    const report = await getReportStatus(reportId, {
      sessionHash: session.sessionHash,
      ownerUid: authUser.uid
    });
    return jsonResponse({ ok: true, report }, 202);
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError(toErrorMessage(error), 400, "report_process_failed");

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
