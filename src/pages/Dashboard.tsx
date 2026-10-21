import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDZD, formatDateTime } from "../lib/format";
import { useAuth } from "../auth/AuthContext";
import { useCompany } from "../company/CompanyContext";
import type { Role } from "../company/CompanyContext";

const roleLabels: Record<Role, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
  seller: "Vendeur",
  reader: "Lecteur",
};

type Check = "checking" | "ok" | "error";

export default function Dashboard() {
  const { user } = useAuth();
  const { company, role } = useCompany();
  const [check, setCheck] = useState<Check>("checking");
  const [profileName, setProfileName] = useState("");

  // Vraie vérification : requête authentifiée sur la base, protégée par RLS.
  useEffect(() => {
    async function run() {
      if (!supabase || !user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) {
        setCheck("error");
      } else {
        setProfileName(data.full_name ?? "");
        setCheck("ok");
      }
    }
    run();
  }, [user]);

  return (
    <section>
      <h1>Tableau de bord</h1>

      <div className="card">
        <h2>Entreprise</h2>
        <p><strong>{company?.name}</strong></p>
        <p className="muted">
          {profileName || user?.email} · {role ? roleLabels[role] : ""}
        </p>
        <p className={"status " + check}>
          {check === "checking" && "Vérification de la base de données…"}
          {check === "ok" && "Base de données : connexion et profil vérifiés"}
          {check === "error" && "Profil introuvable dans la base de données"}
        </p>
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
