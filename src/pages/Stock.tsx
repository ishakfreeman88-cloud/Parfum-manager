import { Link } from "react-router-dom";
import { useCompany } from "../company/CompanyContext";

export default function Stock() {
  const { role } = useCompany();
  const canMove = role === "admin" || role === "manager";
  return (
    <section>
      <h1>Stock</h1>
      <div className="card">
        <Link className="menu-link" to="/stock/matieres">Matières premières</Link>
        <Link className="menu-link" to="/stock/fournisseurs">Fournisseurs</Link>
        {role !== "seller" && (
          <Link className="menu-link" to="/stock/achats">Achats</Link>
        )}
        {canMove && (
          <Link className="menu-link" to="/stock/mouvements/nouveau">Nouveau mouvement</Link>
        )}
        {role !== "seller" && (
          <Link className="menu-link" to="/stock/mouvements">Historique des mouvements</Link>
        )}
      </div>
      <div className="card empty">
        <p className="muted">Produits finis : à venir.</p>
      </div>
    </section>
  );
}
