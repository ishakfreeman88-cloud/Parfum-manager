import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";

type Perfume = {
  id: string;
  name: string;
  reference: string | null;
  description: string | null;
  notes: string | null;
  status: "active" | "archived";
};
type Form = { name: string; reference: string; description: string; notes: string };
const emptyForm: Form = { name: "", reference: "", description: "", notes: "" };

export default function Perfumes() {
  const { company, role } = useCompany();
  const canEdit = role === "admin" || role === "manager";

  const [items, setItems] = useState<Perfume[]>([]);
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
      .from("perfumes")
      .select("id, name, reference, description, notes, status")
      .eq("company_id", company.id)
      .order("name");
    if (err) setError("Chargement impossible. Réessayez.");
    else setItems((data ?? []) as Perfume[]);
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
  function openEdit(p: Perfume) {
    setForm({
      name: p.name,
      reference: p.reference ?? "",
      description: p.description ?? "",
      notes: p.notes ?? "",
    });
    setEditing(p.id);
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
      reference: form.reference.trim() || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error: err } =
      editing === "new"
        ? await supabase.from("perfumes").insert({ company_id: company.id, ...payload })
        : await supabase.from("perfumes").update(payload).eq("id", editing).eq("company_id", company.id);
    setBusy(false);
    if (err) {
      setError(
        err.code === "23505"
          ? "Ce nom ou cette référence existe déjà."
          : "Enregistrement impossible. Réessayez."
      );
      return;
    }
    setEditing(null);
    await load();
  }

  async function setStatus(p: Perfume, status: "active" | "archived") {
    if (busy || !supabase || !company) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("perfumes")
      .update({ status })
      .eq("id", p.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (err) setError("Action impossible. Réessayez.");
    else await load();
  }

  const visible = items.filter((p) => showArchived || p.status === "active");

  return (
    <section>
      <Link className="back-link" to="/fabrication">← Fabrication</Link>
      <h1>Parfums</h1>
      {error && <p className="msg error">{error}</p>}

      {editing && (
        <form className="card" onSubmit={onSave}>
          <h2>{editing === "new" ? "Nouveau parfum" : "Modifier le parfum"}</h2>
          <label className="field">
            <span>Nom</span>
            <input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Référence (facultatif)</span>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
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
            <button type="button" className="link" onClick={() => setEditing(null)}>Annuler</button>
          </div>
        </form>
      )}

      {!editing && canEdit && (
        <button className="btn" type="button" onClick={openNew}>Ajouter un parfum</button>
      )}

      <label className="check">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Afficher les parfums archivés
      </label>

      {loading && <p className="muted">Chargement…</p>}
      {!loading && visible.length === 0 && (
        <div className="card empty">
          <p className="muted">Aucun parfum enregistré.</p>
        </div>
      )}

      {visible.map((p) => (
        <div className="card" key={p.id}>
          <div className="row" style={{ borderTop: 0, padding: 0 }}>
            <div className="row-main">
              <strong>{p.name}</strong>
              {p.reference && <span className="muted"> · {p.reference}</span>}
              {p.status === "archived" && <span className="badge">Archivé</span>}
              {p.description && <div className="muted">{p.description}</div>}
              {p.notes && <div className="muted">{p.notes}</div>}
            </div>
            {canEdit && (
              <div>
                <button type="button" className="btn-small" disabled={busy} onClick={() => openEdit(p)}>
                  Modifier
                </button>{" "}
                {p.status === "active" ? (
                  <button
                    type="button"
                    className="btn-small danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Archiver ce parfum ? L'historique est conservé.")) setStatus(p, "archived");
                    }}
                  >
                    Archiver
                  </button>
                ) : (
                  <button type="button" className="btn-small" disabled={busy} onClick={() => setStatus(p, "active")}>
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
