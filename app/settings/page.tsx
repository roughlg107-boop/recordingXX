import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AppShell title="模型設定" subtitle="本機保存，不寫入系統資料。">
      <SettingsForm />
    </AppShell>
  );
}
