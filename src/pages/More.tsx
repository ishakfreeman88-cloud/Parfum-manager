import { Link } from "react-router-dom";

export default function More() {
  return (
    <section>
      <h1>Plus</h1>
      <div className="card">
        <Link className="menu-link" to="/equipe">
          Équipe et accès
        </Link>
      </div>
      <div className="card empty">
        <p className="muted">Rapports, rappels et paramètres : à venir.</p>
      </div>
    </section>
  );
}
