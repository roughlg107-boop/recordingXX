import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SettingsActivityPanel } from "@/components/settings-activity-panel";
import { SettingsForm } from "@/components/settings-form";
import { getAuthenticatedPageUser } from "@/lib/firebase-auth";
import { listRecentReportActivities } from "@/lib/firestore-reports";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getAuthenticatedPageUser();

  if (!user) {
    redirect("/login");
  }

  const recentActivities = await listRecentReportActivities(30);

  return (
    <AppShell title="模型設定" subtitle="切換平台與模型">
      <div className="grid" style={{ gap: 22 }}>
        <SettingsForm />
        <SettingsActivityPanel
          currentUserLabel={user.email || user.uid}
          recentActivities={recentActivities}
        />
      </div>
    </AppShell>
  );
}
