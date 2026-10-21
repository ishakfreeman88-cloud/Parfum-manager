import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { useCompany } from "../company/CompanyContext";

export default function CreateCompany() {
  const { signOut } = useAuth();
  const { company, loading, error: loadError, refresh } = useCompany();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="auth-wrap">
        <p className="muted">Chargement…</p>
      </div>
    );
  }
  if (company) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !supabase) return; // protection contre le double clic
    setError("");
    if (name.trim().length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc("create_company", { p_name: name.trim() });
      if (err) {
        setError("Impossible de créer l'entreprise : " + err.message);
      } else {
        await refresh();
        navigate("/", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-brand">Parfum Manager</div>
      <form className="card" onSubmit={onSubmit}>
        <h1>Créer votre entreprise</h1>
        <p className="muted">
          Vous en serez l'administrateur. Vous pourrez inviter votre équipe plus tard.
        </p>
        {loadError && (
          <div className="msg error">
            <p>{loadError}</p>
            <button type="button" className="link" onClick={refresh}>
              Réessayer
            </button>
          </div>
        )}
        <label className="field">
          <span>Nom de l'entreprise</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        {error && <p className="msg error">{error}</p>}
        <button className="btn" type="submit" disabled={busy || Boolean(loadError)}>
          {busy ? "Veuillez patienter…" : "Créer l'entreprise"}
        </button>
        <div className="links">
          <button type="button" className="link" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      </form>
    </div>
  );
}
