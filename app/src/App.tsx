import { useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SettingsDialog } from "./components/SettingsDialog";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ReportDetailPage } from "./pages/ReportDetailPage";

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();

  if (!profile) {
    return <></>;
  }

  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark">BR</div>
        <div>
          <p className="eyebrow">Firebase 訪談整理平台</p>
          <h1>客戶拜訪報告系統</h1>
        </div>
      </div>
      <nav className="topbar-actions">
        <Link className={location.pathname === "/" ? "nav-pill is-active" : "nav-pill"} to="/">
          我的報告
        </Link>
        {profile.role === "admin" && (
          <Link
            className={location.pathname === "/admin" ? "nav-pill is-active" : "nav-pill"}
            to="/admin"
          >
            管理後台
          </Link>
        )}
        {profile.role === "admin" && (
          <button className="ghost-button" onClick={onOpenSettings}>
            AI 設定
          </button>
        )}
        <button className="ghost-button" onClick={() => void signOut()}>
          登出
        </button>
      </nav>
    </header>
  );
}

function RoutedApp({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <>
      <Header onOpenSettings={onOpenSettings} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:reportId"
          element={
            <ProtectedRoute>
              <ReportDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireRole="admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="app-frame">
        <RoutedApp onOpenSettings={() => setSettingsOpen(true)} />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </BrowserRouter>
  );
}
