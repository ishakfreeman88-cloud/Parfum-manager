import { Link } from "react-router-dom";
import { useCompany } from "../company/CompanyContext";

export default function Fabrication() {
  const { role } = useCompany();
  const canSeeRecipes = role === "admin" || role === "manager";
  return (
    <section>
      <h1>Fabrication</h1>
      <div className="card">
        <Link className="menu-link" to="/fabrication/parfums">Parfums</Link>
        <Link className="menu-link" to="/fabrication/formats">Formats</Link>
        {canSeeRecipes && (
          <Link className="menu-link" to="/fabrication/recettes">Recettes</Link>
        )}
      </div>
      <div className="card empty">
        <p className="muted">Lots de fabrication : à venir.</p>
      </div>
    </section>
  );
}
