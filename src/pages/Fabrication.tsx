import { Link } from "react-router-dom";

export default function Fabrication() {
  return (
    <section>
      <h1>Fabrication</h1>
      <div className="card">
        <Link className="menu-link" to="/fabrication/parfums">Parfums</Link>
        <Link className="menu-link" to="/fabrication/formats">Formats</Link>
      </div>
      <div className="card empty">
        <p className="muted">
          Recettes : prochaine étape. Lots de fabrication : à venir.
        </p>
      </div>
    </section>
  );
}
