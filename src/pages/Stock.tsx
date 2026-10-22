import { Link } from "react-router-dom";

export default function Stock() {
  return (
    <section>
      <h1>Stock</h1>
      <div className="card">
        <Link className="menu-link" to="/stock/matieres">
          Matières premières
        </Link>
        <Link className="menu-link" to="/stock/fournisseurs">
          Fournisseurs
        </Link>
      </div>
      <div className="card empty">
        <p className="muted">Achats, mouvements et produits finis : à venir.</p>
      </div>
    </section>
  );
}
