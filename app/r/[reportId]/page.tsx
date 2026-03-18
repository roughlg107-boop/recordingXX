import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportView } from "@/components/report-view";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { getServerEnv } from "@/lib/env";
import { getReportStatus } from "@/lib/firestore-reports";
import { requireClientSessionFromCookieValue } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const env = getServerEnv();
  const cookieStore = await cookies();

  let sessionHash = "";
  try {
    sessionHash = requireClientSessionFromCookieValue(
      cookieStore.get(SESSION_COOKIE_NAME)?.value,
      env.rateLimitSalt
    ).sessionHash;
  } catch {
    notFound();
  }

  const report = await getReportStatus(reportId, sessionHash);

  if (!report) {
    notFound();
  }

  return (
    <AppShell title="報告詳情" subtitle="單筆結果頁與 Word 匯出。">
      <ReportView initialReport={report} />
    </AppShell>
  );
}
