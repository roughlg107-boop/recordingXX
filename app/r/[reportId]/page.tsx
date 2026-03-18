import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportView } from "@/components/report-view";
import { getReportStatus } from "@/lib/firestore-reports";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const report = await getReportStatus(reportId);

  if (!report) {
    notFound();
  }

  return (
    <AppShell title="報告詳情" subtitle="單筆報告只保留一天，可下載 Word。">
      <ReportView initialReport={report} />
    </AppShell>
  );
}
