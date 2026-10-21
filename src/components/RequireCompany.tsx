import { Navigate, Outlet } from "react-router-dom";
import { useCompany } from "../company/CompanyContext";

export default function RequireCompany() {
  const { company, loading, error, refresh } = useCompany();

  if (loading) {
    return (
      <div className="content">
        <p className="muted">Chargement…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="content">
        <div className="card">
          <p className="msg error">{error}</p>
          <button className="btn" type="button" onClick={refresh}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }
  if (!company) return <Navigate to="/company/new" replace />;
  return <Outlet />;
}
