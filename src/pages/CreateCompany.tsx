import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { useCompany } from "../company/CompanyContext";

type DbError = { message: string; code?: string };

// Les messages des fonctions SQL (code P0001) sont déjà rédigés en français.
function errText(err: DbError): string {
  return err.code === "P0001" ? err.message : "Une erreur est survenue. Réessayez.";
}

export default function CreateCompany() {
  const { signOut } = useAuth();
  const { company, loading, error: loadError, refresh } = useCompany();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
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

  async function onCreate(e: FormEvent) {
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
      if (err) setError(errText(err));
      else {
        await refresh();
        navigate("/", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    if (busy || !supabase) return;
    setError("");
    if (code.trim().length < 8) {
      setError("Saisissez le code d'invitation complet.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc("accept_invitation", { p_code: code.trim() });
      if (err) setError(errText(err));
      else {
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

      {loadError && (
        <div className="msg error">
          <p>{loadError}</p>
          <button type="button" className="link" onClick={refresh}>
            Réessayer
          </button>
        </div>
      )}
      {error && <p className="msg error">{error}</p>}

      <form className="card" onSubmit={onJoin}>
        <h1>Rejoindre une entreprise</h1>
        <p className="muted">Saisissez le code transmis par votre administrateur.</p>
        <label className="field">
          <span>Code d'invitation</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <button className="btn" type="submit" disabled={busy || Boolean(loadError)}>
          {busy ? "Veuillez patienter…" : "Rejoindre"}
        </button>
      </form>

      <form className="card" onSubmit={onCreate}>
        <h1>Créer votre entreprise</h1>
        <p className="muted">Vous en serez l'administrateur.</p>
        <label className="field">
          <span>Nom de l'entreprise</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </label>
        <button className="btn" type="submit" disabled={busy || Boolean(loadError)}>
          {busy ? "Veuillez patienter…" : "Créer l'entreprise"}
        </button>
      </form>

      <div className="links">
        <button type="button" className="link" onClick={signOut}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
