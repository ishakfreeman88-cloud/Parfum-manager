import { Link } from "react-router-dom";
import { useCompany } from "../company/CompanyContext";

export default function More() {
  const { role } = useCompany();
  const canExport = role === "admin" || role === "manager";
  return (
    <section>
      <h1>Plus</h1>
      <div className="card">
        <Link className="menu-link" to="/equipe">Équipe et accès</Link>
        {canExport && (
          <Link className="menu-link" to="/plus/sauvegarde">Sauvegarde et export</Link>
        )}
      </div>
      <div className="card empty">
        <p className="muted">Rapports, rappels et paramètres : à venir.</p>
      </div>
    </section>
  );
}
