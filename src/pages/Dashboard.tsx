import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { formatDZD, formatDateTime } from "../lib/format";

type Status = "checking" | "ok" | "error" | "missing";

export default function Dashboard() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    async function check() {
      if (!isSupabaseConfigured || !supabase) {
        setStatus("missing");
        return;
      }
      const { error } = await supabase.auth.getSession();
      if (error) {
        setStatus("error");
        setDetail(error.message);
      } else {
        setStatus("ok");
      }
    }
    check();
  }, []);

  const labels: Record<Status, string> = {
    checking: "Vérification en cours…",
    ok: "Connecté à Supabase",
    error: "Erreur de connexion",
    missing: "Variables Supabase non configurées",
  };

  return (
    <section>
      <h1>Tableau de bord</h1>

      <div className="card">
        <h2>Connexion à la base de données</h2>
        <p className={"status " + status}>{labels[status]}</p>
        {detail && <p className="muted">{detail}</p>}
      </div>

      <div className="card">
        <h2>Indicateurs</h2>
        <p className="muted">Aucune opération enregistrée.</p>
        <p>Chiffre d'affaires : <strong>{formatDZD(0)}</strong></p>
        <p className="muted">Heure locale (Alger) : {formatDateTime(new Date())}</p>
      </div>
    </section>
  );
}
