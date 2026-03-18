import { NextRequest } from "next/server";

import { getReportStatus } from "@/lib/firestore-reports";
import { jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await context.params;
  const report = await getReportStatus(reportId);

  if (!report) {
    return jsonResponse({ ok: false, message: "找不到這份報告，可能已到期。" }, 404);
  }

  return jsonResponse({ ok: true, report });
}
