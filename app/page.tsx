import { AppShell } from "@/components/app-shell";
import { UploadExperience } from "@/components/upload-experience";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell title="建立報告" subtitle="拜訪錄音轉摘要">
      <UploadExperience />
    </AppShell>
  );
}
