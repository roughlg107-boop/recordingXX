import { NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { getReportStatus } from "@/lib/firestore-reports";
import { AppError, toErrorMessage } from "@/lib/errors";
import { requireAuthenticatedRequest } from "@/lib/firebase-auth";
import { requireClientSession } from "@/lib/session";
import { jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await context.params;
    const authUser = await requireAuthenticatedRequest(request);
    const env = getServerEnv();
    const session = requireClientSession(request, env.rateLimitSalt);
    const report = await getReportStatus(reportId, {
      sessionHash: session.sessionHash,
      ownerUid: authUser.uid
    });

    if (!report) {
      return jsonResponse({ ok: false, message: "找不到這份報告，可能已到期。" }, 404);
    }

    return jsonResponse({ ok: true, report });
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError(toErrorMessage(error), 400, "report_status_failed");

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
