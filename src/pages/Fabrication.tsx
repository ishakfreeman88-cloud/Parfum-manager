import { Link } from "react-router-dom";
import { useCompany } from "../company/CompanyContext";

export default function Fabrication() {
  const { role } = useCompany();
  const staff = role === "admin" || role === "manager";
  return (
    <section>
      <h1>Fabrication</h1>
      <div className="card">
        {staff && <Link className="menu-link" to="/fabrication/lots/nouveau">Nouvelle fabrication</Link>}
        {staff && <Link className="menu-link" to="/fabrication/lots">Lots de fabrication</Link>}
        {staff && <Link className="menu-link" to="/fabrication/recettes">Recettes</Link>}
        <Link className="menu-link" to="/fabrication/parfums">Parfums</Link>
        <Link className="menu-link" to="/fabrication/formats">Formats</Link>
      </div>
      <div className="card empty">
        <p className="muted">Conditionnement en flacons et produits finis : à venir.</p>
      </div>
    </section>
  );
}
