import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";

export default function RequireAuth() {
  const { session, loading, recovery } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <div className="content">
        <div className="card">
          <p className="status missing">Variables Supabase non configurées.</p>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="content">
        <p className="muted">Chargement…</p>
      </div>
    );
  }
  if (recovery) return <Navigate to="/reset" replace />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
