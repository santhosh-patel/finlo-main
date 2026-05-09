import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const { isAuthed, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </main>
    );
  }

  if (!isAuthed) {
    const from = requireAdmin
      ? { pathname: "/admin", search: location.search }
      : { pathname: location.pathname, search: location.search };
    return <Navigate to="/login" replace state={{ from }} />;
  }
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
