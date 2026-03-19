import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";
import { getAuthenticatedPageUser } from "@/lib/firebase-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getAuthenticatedPageUser();

  if (user) {
    redirect("/");
  }

  return (
    <AppShell title="登入" subtitle="使用公司帳號登入" hideNavigation>
      <LoginForm />
    </AppShell>
  );
}
