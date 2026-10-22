import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "archived";
};
type Form = { name: string; phone: string; address: string; notes: string };
const emptyForm: Form = { name: "", phone: "", address: "", notes: "" };

export default function Suppliers() {
  const { company, role } = useCompany();
  const canEdit = role === "admin" || role === "manager";

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // "new" ou l'id
  const [form, setForm] = useState<Form>(emptyForm);

  const load = useCallback(async () => {
    if (!supabase || !company) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("suppliers")
      .select("id, name, phone, address, notes, status")
      .eq("company_id", company.id)
      .order("name");
    if (err) setError("Chargement impossible. Réessayez.");
    else setItems((data ?? []) as Supplier[]);
    setLoading(false);
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setForm(emptyForm);
    setEditing("new");
    setError("");
  }
  function openEdit(s: Supplier) {
    setForm({ name: s.name, phone: s.phone ?? "", address: s.address ?? "", notes: s.notes ?? "" });
    setEditing(s.id);
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
    setBusy(true);
    const payload = {
      name,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error: err } =
      editing === "new"
        ? await supabase.from("suppliers").insert({ company_id: company.id, ...payload })
        : await supabase.from("suppliers").update(payload).eq("id", editing).eq("company_id", company.id);
    setBusy(false);
    if (err) {
      setError("Enregistrement impossible. Réessayez.");
      return;
    }
    setEditing(null);
    await load();
  }

  async function setStatus(s: Supplier, status: "active" | "archived") {
    if (busy || !supabase || !company) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("suppliers")
      .update({ status })
      .eq("id", s.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (err) setError("Action impossible. Réessayez.");
    else await load();
  }

  const visible = items.filter((s) => showArchived || s.status === "active");

  return (
    <section>
      <Link className="back-link" to="/stock">← Stock</Link>
      <h1>Fournisseurs</h1>
      {error && <p className="msg error">{error}</p>}

      {editing && (
        <form className="card" onSubmit={onSave}>
          <h2>{editing === "new" ? "Nouveau fournisseur" : "Modifier le fournisseur"}</h2>
          <label className="field">
            <span>Nom</span>
            <input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Téléphone</span>
            <input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Adresse</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
          Ajouter un fournisseur
        </button>
      )}

      <label className="check">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Afficher les fournisseurs archivés
      </label>

      {loading && <p className="muted">Chargement…</p>}
      {!loading && visible.length === 0 && (
        <div className="card empty">
          <p className="muted">Aucun fournisseur enregistré.</p>
        </div>
      )}

      {visible.map((s) => (
        <div className="card" key={s.id}>
          <div className="row" style={{ borderTop: 0, padding: 0 }}>
            <div className="row-main">
              <strong>{s.name}</strong>
              {s.status === "archived" && <span className="badge">Archivé</span>}
              {s.phone && <div className="muted">{s.phone}</div>}
              {s.address && <div className="muted">{s.address}</div>}
              {s.notes && <div className="muted">{s.notes}</div>}
            </div>
            {canEdit && (
              <div>
                <button type="button" className="btn-small" disabled={busy} onClick={() => openEdit(s)}>
                  Modifier
                </button>{" "}
                {s.status === "active" ? (
                  <button
                    type="button"
                    className="btn-small danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Archiver ce fournisseur ? L'historique est conservé.")) setStatus(s, "archived");
                    }}
                  >
                    Archiver
                  </button>
                ) : (
                  <button type="button" className="btn-small" disabled={busy} onClick={() => setStatus(s, "active")}>
                    Restaurer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
