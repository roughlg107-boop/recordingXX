import { NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { buildReportDocx } from "@/lib/docx";
import { AppError, toErrorMessage } from "@/lib/errors";
import { assertReportExists } from "@/lib/firestore-reports";
import { requireClientSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await context.params;
    const env = getServerEnv();
    const session = requireClientSession(request, env.rateLimitSalt);
    const report = await assertReportExists(reportId, session.sessionHash);

    if (report.status !== "completed") {
      return Response.json({ ok: false, message: "報告尚未完成，暫時無法下載。" }, { status: 409 });
    }

    const fileBuffer = await buildReportDocx(report);
    const fileName = `${report.shopName}-visit-report.docx`;

    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
      }
    });
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError(toErrorMessage(error), 400, "report_docx_failed");

    return Response.json(
      {
        ok: false,
        code: appError.code,
        message: appError.message
      },
      { status: appError.statusCode }
    );
  }
}
