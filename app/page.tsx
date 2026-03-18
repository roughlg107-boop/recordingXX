import { AppShell } from "@/components/app-shell";
import { UploadExperience } from "@/components/upload-experience";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell title="RecordingXX" subtitle="Sales visit recorder to proposal-ready brief.">
      <UploadExperience />
    </AppShell>
  );
}
