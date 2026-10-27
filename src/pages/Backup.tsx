import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { downloadCsv, fetchAll, dateStamp } from "../lib/csv";
import { materialTypes } from "../lib/units";
import { movementLabels } from "../lib/movements";
import { formatDateTime } from "../lib/format";

type Sup = {
  id: string; name: string; phone: string | null; address: string | null;
  notes: string | null; status: string; created_at: string;
};
type Mat = {
  id: string; name: string; reference: string | null; material_type: string; unit: string;
  supplier_id: string | null; min_stock: number | string; quantity_on_hand: number | string;
  avg_cost: number | string; status: string; created_at: string;
};
type Mv = {
  id: string; material_id: string; movement_type: string; quantity_delta: number | string;
  unit_cost: number | string; quantity_after: number | string; reason: string | null;
  notes: string | null; created_by: string | null; created_at: string;
};

const statusLabel = (s: string) => (s === "archived" ? "Archivé" : "Actif");

export default function Backup() {
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";
  const storeKey = "pm_last_export_" + (company?.id ?? "");

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [last, setLast] = useState(() => {
    try {
      return localStorage.getItem(storeKey) ?? "";
    } catch {
      return "";
    }
  });

  async function run(name: string, fn: () => Promise<number>) {
    if (busy || !supabase || !company) return; // un seul export à la fois
    setBusy(name);
    setError("");
    setInfo("");
    try {
      const n = await fn();
      setInfo(n + " ligne(s) exportée(s).");
      const now = new Date().toISOString();
      try {
        localStorage.setItem(storeKey, now);
      } catch {
        /* stockage indisponible : sans importance */
      }
      setLast(now);
    } catch {
      setError("Export impossible. Vérifiez votre connexion et réessayez.");
    }
    setBusy("");
  }

  async function exportSuppliers(): Promise<number> {
    const db = supabase!;
    const cid = company!.id;
    const sups = await fetchAll<Sup>((a, b) =>
      db.from("suppliers")
        .select("id, name, phone, address, notes, status, created_at")
        .eq("company_id", cid).order("created_at").order("id").range(a, b)
    );
    downloadCsv(
      "fournisseurs_" + dateStamp() + ".csv",
      ["Nom", "Téléphone", "Adresse", "Notes", "Statut", "Créé le"],
      sups.map((s) => [s.name, s.phone, s.address, s.notes, statusLabel(s.status), formatDateTime(s.created_at)])
    );
    return sups.length;
  }

  async function exportMaterials(): Promise<number> {
    const db = supabase!;
    const cid = company!.id;
    const [mats, sups] = await Promise.all([
      fetchAll<Mat>((a, b) =>
        db.from("raw_materials")
          .select("id, name, reference, material_type, unit, supplier_id, min_stock, quantity_on_hand, avg_cost, status, created_at")
          .eq("company_id", cid).order("created_at").order("id").range(a, b)
      ),
      fetchAll<Sup>((a, b) =>
        db.from("suppliers")
          .select("id, name, phone, address, notes, status, created_at")
          .eq("company_id", cid).order("created_at").order("id").range(a, b)
      ),
    ]);
    const supName = new Map(sups.map((s) => [s.id, s.name]));
    downloadCsv(
      "matieres_" + dateStamp() + ".csv",
      ["Nom", "Référence", "Type", "Unité de stock", "Fournisseur", "Seuil d'alerte",
       "Quantité en stock", "Coût moyen (DA par unité de stock)", "Valeur estimée (DA)", "Statut", "Créée le"],
      mats.map((m) => {
        const q = Number(m.quantity_on_hand);
        const c = Number(m.avg_cost);
        return [
          m.name, m.reference, materialTypes[m.material_type] ?? m.material_type, m.unit,
          m.supplier_id ? supName.get(m.supplier_id) ?? "" : "",
          Number(m.min_stock), q, c, Math.round(q * c * 100) / 100,
          statusLabel(m.status), formatDateTime(m.created_at),
        ];
      })
    );
    return mats.length;
  }

  async function exportMovements(): Promise<number> {
    const db = supabase!;
    const cid = company!.id;
    const [mvs, mats] = await Promise.all([
      fetchAll<Mv>((a, b) =>
        db.from("stock_movements")
          .select("id, material_id, movement_type, quantity_delta, unit_cost, quantity_after, reason, notes, created_by, created_at")
          .eq("company_id", cid).order("created_at").order("id").range(a, b)
      ),
      fetchAll<Mat>((a, b) =>
        db.from("raw_materials")
          .select("id, name, reference, material_type, unit, supplier_id, min_stock, quantity_on_hand, avg_cost, status, created_at")
          .eq("company_id", cid).order("created_at").order("id").range(a, b)
      ),
    ]);
    const matOf = new Map(mats.map((m) => [m.id, m]));
    const userIds = Array.from(new Set(mvs.map((m) => m.created_by).filter(Boolean))) as string[];
    const userName = new Map<string, string>();
    if (userIds.length > 0) {
      const { data } = await db.from("profiles").select("id, full_name").in("id", userIds);
      (data ?? []).forEach((p: { id: string; full_name: string | null }) => userName.set(p.id, p.full_name ?? ""));
    }
    downloadCsv(
      "mouvements_stock_" + dateStamp() + ".csv",
      ["Date", "Matière", "Type", "Quantité (unité de stock)", "Unité", "Stock après",
       "Coût unitaire (DA par unité de stock)", "Motif", "Notes", "Utilisateur"],
      mvs.map((m) => {
        const mat = matOf.get(m.material_id);
        return [
          formatDateTime(m.created_at), mat?.name ?? "", movementLabels[m.movement_type] ?? m.movement_type,
          Number(m.quantity_delta), mat?.unit ?? "", Number(m.quantity_after), Number(m.unit_cost),
          m.reason, m.notes, m.created_by ? userName.get(m.created_by) || "Ancien membre" : "Système",
        ];
      })
    );
    return mvs.length;
  }

  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/plus">← Plus</Link>
        <h1>Sauvegarde et export</h1>
        <div className="card empty">
          <p className="muted">Réservé aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link className="back-link" to="/plus">← Plus</Link>
      <h1>Sauvegarde et export</h1>
      {error && <p className="msg error">{error}</p>}
      {info && <p className="msg ok">{info}</p>}

      <div className="card">
        <h2>Dernier export sur cet appareil</h2>
        {last ? (
          <p>
            {formatDateTime(last)}
            {days !== null && days >= 7 && <span className="badge warn">Il y a {days} jours</span>}
          </p>
        ) : (
          <p className="muted">Aucun export enregistré sur cet appareil.</p>
        )}
        <p className="muted">
          Faites un export toutes les semaines et gardez les fichiers hors de l'application (ordinateur, Drive).
        </p>
      </div>

      <div className="card">
        <h2>Télécharger (CSV)</h2>
        <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => run("mat", exportMaterials)}>
          {busy === "mat" ? "Veuillez patienter…" : "Matières premières"}
        </button>
        <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => run("sup", exportSuppliers)}>
          {busy === "sup" ? "Veuillez patienter…" : "Fournisseurs"}
        </button>
        <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => run("mv", exportMovements)}>
          {busy === "mv" ? "Veuillez patienter…" : "Mouvements de stock"}
        </button>
        <p className="muted">
          Les fichiers contiennent toutes les lignes, y compris les éléments archivés. Ils contiennent des coûts :
          ne les partagez pas.
        </p>
      </div>
    </section>
  );
}
