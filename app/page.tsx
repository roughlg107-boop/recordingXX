import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { UploadExperience } from "@/components/upload-experience";
import { getAuthenticatedPageUser } from "@/lib/firebase-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedPageUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell title="建立報告" subtitle="拜訪錄音轉摘要">
      <UploadExperience />
    </AppShell>
  );
}
