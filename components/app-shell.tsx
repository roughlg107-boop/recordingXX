"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";

export function AppShell({
  children,
  title,
  subtitle,
  hideNavigation = false
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  hideNavigation?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, signOut, user } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-copy">
            <h1>RecordingXX</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="topbar-side">
          <span className="page-badge">{title}</span>
          {!hideNavigation && (
            <nav className="nav-links">
              <Link className="nav-link" data-active={pathname === "/"} href="/">
                建立報告
              </Link>
              <Link className="nav-link" data-active={pathname === "/settings"} href="/settings">
                模型設定
              </Link>
            </nav>
          )}
          {user ? (
            <>
              <span className="user-chip">{user.email || "已登入"}</span>
              <button className="secondary-button compact-button" type="button" onClick={handleSignOut}>
                登出
              </button>
            </>
          ) : loading ? (
            <span className="user-chip">驗證中</span>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
