import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDZD, formatDateTime } from "../lib/format";
import { useAuth } from "../auth/AuthContext";
import { useCompany } from "../company/CompanyContext";
import type { Role } from "../company/CompanyContext";
import { formatQty } from "../lib/units";

const roleLabels: Record<Role, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
  seller: "Vendeur",
  reader: "Lecteur",
};

type Check = "checking" | "ok" | "error";
type StockRow = {
  id: string;
  name: string;
  unit: string;
  min_stock: number;
  quantity_on_hand: number;
  avg_cost: number;
};

export default function Dashboard() {
  const { user } = useAuth();
  const { company, role } = useCompany();
  const [check, setCheck] = useState<Check>("checking");
  const [profileName, setProfileName] = useState("");
  const [stock, setStock] = useState<StockRow[] | null>(null);

  useEffect(() => {
    async function run() {
      if (!supabase || !user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) setCheck("error");
      else {
        setProfileName(data.full_name ?? "");
        setCheck("ok");
      }
    }
    run();
  }, [user]);

  useEffect(() => {
    async function run() {
      if (!supabase || !company) return;
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, unit, min_stock, quantity_on_hand, avg_cost")
        .eq("company_id", company.id)
        .eq("status", "active");
      if (!error) {
        setStock(
          (data ?? []).map((r: StockRow) => ({
            ...r,
            min_stock: Number(r.min_stock),
            quantity_on_hand: Number(r.quantity_on_hand),
            avg_cost: Number(r.avg_cost),
          }))
        );
      }
    }
    run();
  }, [company]);

  const low = (stock ?? []).filter((r) => r.min_stock > 0 && r.quantity_on_hand <= r.min_stock);
  const stockValue = (stock ?? []).reduce((s, r) => s + r.quantity_on_hand * r.avg_cost, 0);

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
        <h2>Stock de matières premières</h2>
        {stock === null && <p className="muted">Chargement…</p>}
        {stock !== null && (
          <>
            <p className="muted">{stock.length} matière(s) active(s)</p>
            {role !== "seller" && (
              <>
                <p>Valeur estimée : <strong>{formatDZD(stockValue)}</strong></p>
                <p className="muted">
                  Quantités en stock × coût moyen pondéré. Ce n'est ni de la trésorerie ni un bénéfice.
                </p>
              </>
            )}
            {low.length === 0 ? (
              <p className="muted">Aucune alerte de stock faible.</p>
            ) : (
              <>
                <p className="status error">{low.length} matière(s) à réapprovisionner</p>
                {low.map((r) => (
                  <div className="row" key={r.id}>
                    <div className="row-main">
                      <strong>{r.name}</strong>
                      <div className="muted">
                        {formatQty(r.quantity_on_hand, r.unit)} (seuil : {formatQty(r.min_stock, r.unit)})
                      </div>
                    </div>
                  </div>
                ))}
                <Link className="menu-link" to="/stock/matieres">Voir les matières</Link>
              </>
            )}
          </>
        )}
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
