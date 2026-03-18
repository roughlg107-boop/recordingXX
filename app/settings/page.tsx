import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AppShell title="AI 設定" subtitle="只保存到本機瀏覽器，不進資料庫。">
      <SettingsForm />
    </AppShell>
  );
}
