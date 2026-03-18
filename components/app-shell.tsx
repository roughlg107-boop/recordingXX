"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppShell({
  children,
  title,
  subtitle
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-copy">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        <nav className="nav-links">
          <Link className="nav-link" data-active={pathname === "/"} href="/">
            建立報告
          </Link>
          <Link className="nav-link" data-active={pathname === "/settings"} href="/settings">
            模型設定
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
