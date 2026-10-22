import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { materialTypes, baseUnits, formatQty, formatCost } from "../lib/units";

type Material = {
  id: string;
  name: string;
  reference: string | null;
  material_type: string;
  unit: string;
  description: string | null;
  supplier_id: string | null;
  min_stock: number;
  quantity_on_hand: number;
  avg_cost: number;
  notes: string | null;
  status: "active" | "archived";
};
type SupplierOpt = { id: string; name: string };
type Form = {
  name: string;
  reference: string;
  material_type: string;
  unit: string;
  supplier_id: string;
  min_stock: string;
  description: string;
  notes: string;
};
const emptyForm: Form = {
  name: "",
  reference: "",
  material_type: "extract",
  unit: "ml",
  supplier_id: "",
  min_stock: "0",
  description: "",
  notes: "",
};

export default function Materials() {
  const { company, role } = useCompany();
  const canEdit = role === "admin" || role === "manager";
  const showCost = role !== "seller"; // confort d'affichage seulement, voir compte rendu

  const [items, setItems] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // "new" ou l'id
  const [form, setForm] = useState<Form>(emptyForm);

  const load = useCallback(async () => {
    if (!supabase || !company) return;
    setLoading(true);
    const [m, s] = await Promise.all([
      supabase
        .from("raw_materials")
        .select(
          "id, name, reference, material_type, unit, description, supplier_id, min_stock, quantity_on_hand, avg_cost, notes, status"
        )
        .eq("company_id", company.id)
        .order("name"),
      supabase.from("suppliers").select("id, name").eq("company_id", company.id).eq("status", "active").order("name"),
    ]);
    if (m.error) setError("Chargement impossible. Réessayez.");
    else
      setItems(
        (m.data ?? []).map((r: Material) => ({
          ...r,
          min_stock: Number(r.min_stock),
          quantity_on_hand: Number(r.quantity_on_hand),
          avg_cost: Number(r.avg_cost),
        }))
      );
    if (!s.error) setSuppliers((s.data ?? []) as SupplierOpt[]);
    setLoading(false);
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (m) =>
        (showArchived || m.status === "active") &&
        (!typeFilter || m.material_type === typeFilter) &&
        (!q || m.name.toLowerCase().includes(q) || (m.reference ?? "").toLowerCase().includes(q))
    );
  }, [items, search, typeFilter, showArchived]);

  function openNew() {
    setForm(emptyForm);
    setEditing("new");
    setError("");
  }
  function openEdit(m: Material) {
    setForm({
      name: m.name,
      reference: m.reference ?? "",
      material_type: m.material_type,
      unit: m.unit,
      supplier_id: m.supplier_id ?? "",
      min_stock: String(m.min_stock),
      description: m.description ?? "",
      notes: m.notes ?? "",
    });
    setEditing(m.id);
    setError("");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (busy || !supabase || !company || !editing) return;
    setError("");
    const name = form.name.trim();
    if (name.length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    const min = Number(form.min_stock.replace(",", "."));
    if (!Number.isFinite(min) || min < 0) {
      setError("Le seuil d'alerte doit être un nombre positif ou nul.");
      return;
    }
    setBusy(true);
    const common = {
      name,
      reference: form.reference.trim() || null,
      material_type: form.material_type,
      description: form.description.trim() || null,
      supplier_id: form.supplier_id || null,
      min_stock: min,
      notes: form.notes.trim() || null,
    };
    const { error: err } =
      editing === "new"
        ? await supabase.from("raw_materials").insert({ company_id: company.id, unit: form.unit, ...common })
        : await supabase.from("raw_materials").update(common).eq("id", editing).eq("company_id", company.id);
    setBusy(false);
    if (err) {
      setError(err.code === "23505" ? "Cette référence existe déjà." : "Enregistrement impossible. Réessayez.");
      return;
    }
    setEditing(null);
    await load();
  }

  async function setStatus(m: Material, status: "active" | "archived") {
    if (busy || !supabase || !company) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("raw_materials")
      .update({ status })
      .eq("id", m.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (err) setError("Action impossible. Réessayez.");
    else await load();
  }

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name;

  return (
    <section>
      <Link className="back-link" to="/stock">← Stock</Link>
      <h1>Matières premières</h1>
      {error && <p className="msg error">{error}</p>}

      {editing && (
        <form className="card" onSubmit={onSave}>
          <h2>{editing === "new" ? "Nouvelle matière" : "Modifier la matière"}</h2>
          <label className="field">
            <span>Nom</span>
            <input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Référence (facultatif)</span>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={form.material_type} onChange={(e) => setForm({ ...form, material_type: e.target.value })}>
              {Object.entries(materialTypes).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Unité de stock</span>
            {editing === "new" ? (
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {Object.entries(baseUnits).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            ) : (
              <input value={baseUnits[form.unit] ?? form.unit} disabled />
            )}
          </label>
          {editing === "new" && (
            <p className="muted">
              L'unité ne pourra plus être changée. Les achats en litres ou en kilos seront convertis automatiquement.
            </p>
          )}
          <label className="field">
            <span>Fournisseur habituel</span>
            <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">Aucun</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Seuil d'alerte (en {form.unit === "unit" ? "unités" : form.unit})</span>
            <input value={form.min_stock} inputMode="decimal" onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Veuillez patienter…" : "Enregistrer"}
          </button>
          <div className="links">
            <button type="button" className="link" onClick={() => setEditing(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {!editing && canEdit && (
        <button className="btn" type="button" onClick={openNew}>
          Ajouter une matière
        </button>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <input placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(materialTypes).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <label className="check">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Afficher les matières archivées
      </label>

      {loading && <p className="muted">Chargement…</p>}
      {!loading && visible.length === 0 && (
        <div className="card empty">
          <p className="muted">Aucune matière enregistrée.</p>
        </div>
      )}

      {visible.map((m) => {
        const low = m.min_stock > 0 && m.quantity_on_hand <= m.min_stock;
        return (
          <div className="card" key={m.id}>
            <div className="row" style={{ borderTop: 0, padding: 0 }}>
              <div className="row-main">
                <strong>{m.name}</strong>
                {m.reference && <span className="muted"> · {m.reference}</span>}
                {m.status === "archived" && <span className="badge">Archivé</span>}
                {low && m.status === "active" && <span className="badge warn">Stock faible</span>}
                <div className="muted">{materialTypes[m.material_type] ?? m.material_type}</div>
                <div>
                  Stock : <strong>{formatQty(m.quantity_on_hand, m.unit)}</strong>
                </div>
                {showCost && m.quantity_on_hand > 0 && (
                  <div className="muted">Coût moyen : {formatCost(m.avg_cost, m.unit)}</div>
                )}
                {m.min_stock > 0 && <div className="muted">Seuil d'alerte : {formatQty(m.min_stock, m.unit)}</div>}
                {supplierName(m.supplier_id) && <div className="muted">Fournisseur : {supplierName(m.supplier_id)}</div>}
              </div>
              {canEdit && (
                <div>
                  <button type="button" className="btn-small" disabled={busy} onClick={() => openEdit(m)}>
                    Modifier
                  </button>{" "}
                  {m.status === "active" ? (
                    <button
                      type="button"
                      className="btn-small danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Archiver cette matière ? L'historique est conservé.")) setStatus(m, "archived");
                      }}
                    >
                      Archiver
                    </button>
                  ) : (
                    <button type="button" className="btn-small" disabled={busy} onClick={() => setStatus(m, "active")}>
                      Restaurer
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
