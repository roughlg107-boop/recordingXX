import { Navigate } from "react-router-dom";

import { useAuth } from "../auth";
import type { UserRole } from "../types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: UserRole;
}

export function ProtectedRoute({
  children,
  requireRole,
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="center-screen">載入中...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole && profile?.role !== requireRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}
