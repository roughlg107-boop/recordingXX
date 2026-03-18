import { AppShell } from "@/components/app-shell";
import { UploadExperience } from "@/components/upload-experience";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell title="RecordingXX" subtitle="拜訪錄音轉提案摘要">
      <UploadExperience />
    </AppShell>
  );
}
