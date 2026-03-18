import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AppShell title="模型設定" subtitle="切換平台與模型">
      <SettingsForm />
    </AppShell>
  );
}
