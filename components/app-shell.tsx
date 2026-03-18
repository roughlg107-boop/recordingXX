import Link from "next/link";

export function AppShell({
  children,
  title,
  subtitle
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
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
          <Link className="nav-link" href="/">
            上傳錄音
          </Link>
          <Link className="nav-link" href="/settings">
            AI 設定
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
