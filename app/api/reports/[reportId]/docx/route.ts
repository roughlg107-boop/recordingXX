import { NextRequest } from "next/server";

import { buildReportDocx } from "@/lib/docx";
import { assertReportExists } from "@/lib/firestore-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await context.params;
  const report = await assertReportExists(reportId);

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
}
