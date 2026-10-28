import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatQty } from "../lib/units";
import { parseNumber } from "../lib/movements";

type Format = {
  id: string;
  name: string;
  volume_ml: number;
  status: "active" | "archived";
};

export default function Formats() {
  const { company, role } = useCompany();
  const canEdit = role === "admin" || role === "manager";

  const [items, setItems] = useState<Format[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // "new" ou l'id
  const [name, setName] = useState("");
  const [volume, setVolume] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !company) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("product_formats")
      .select("id, name, volume_ml, status")
      .eq("company_id", company.id)
      .order("volume_ml");
    if (err) setError("Chargement impossible. Réessayez.");
    else
      setItems(
        (data ?? []).map((r: Format) => ({ ...r, volume_ml: Number(r.volume_ml) }))
      );
    setLoading(false);
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setName("");
    setVolume("");
    setEditing("new");
    setError("");
  }
  function openEdit(f: Format) {
    setName(f.name);
    setVolume(String(f.volume_ml));
    setEditing(f.id);
    setError("");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (busy || !supabase || !company || !editing) return;
    setError("");

    let vol = 0;
    if (editing === "new") {
      vol = parseNumber(volume);
      if (volume.trim() === "" || !Number.isFinite(vol) || vol <= 0 || vol > 100000) {
        setError("Saisissez un volume valide en millilitres.");
        return;
      }
    }
    const finalName = name.trim() || (editing === "new" ? String(vol) + " ml" : "");
    if (finalName.length < 1) {
      setError("Le nom est obligatoire.");
      return;
    }

    setBusy(true);
    const { error: err } =
      editing === "new"
        ? await supabase
            .from("product_formats")
            .insert({ company_id: company.id, name: finalName, volume_ml: vol })
        : await supabase
            .from("product_formats")
            .update({ name: finalName })
            .eq("id", editing)
            .eq("company_id", company.id);
    setBusy(false);
    if (err) {
      setError(
        err.code === "23505"
          ? "Un format de ce volume existe déjà."
          : "Enregistrement impossible. Réessayez."
      );
      return;
    }
    setEditing(null);
    await load();
  }

  async function setStatus(f: Format, status: "active" | "archived") {
    if (busy || !supabase || !company) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("product_formats")
      .update({ status })
      .eq("id", f.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (err) setError("Action impossible. Réessayez.");
    else await load();
  }

  const visible = items.filter((f) => showArchived || f.status === "active");

  return (
    <section>
      <Link className="back-link" to="/fabrication">← Fabrication</Link>
      <h1>Formats</h1>
      {error && <p className="msg error">{error}</p>}

      {editing && (
        <form className="card" onSubmit={onSave}>
          <h2>{editing === "new" ? "Nouveau format" : "Modifier le format"}</h2>
          <label className="field">
            <span>Volume en millilitres (ml)</span>
            {editing === "new" ? (
              <input value={volume} inputMode="decimal" onChange={(e) => setVolume(e.target.value)} />
            ) : (
              <input value={volume + " ml"} disabled />
            )}
          </label>
          <p className="muted">
            Le volume est toujours en ml (50 ml, pas 5 cl). Il ne pourra plus être changé après la création.
          </p>
          <label className="field">
            <span>Nom (facultatif : « 50 ml » par défaut)</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
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
        <button className="btn" type="button" onClick={openNew}>Ajouter un format</button>
      )}

      <label className="check">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Afficher les formats archivés
      </label>

      {loading && <p className="muted">Chargement…</p>}
      {!loading && visible.length === 0 && (
        <div className="card empty">
          <p className="muted">Aucun format enregistré.</p>
        </div>
      )}

      {visible.map((f) => (
        <div className="card" key={f.id}>
          <div className="row" style={{ borderTop: 0, padding: 0 }}>
            <div className="row-main">
              <strong>{f.name}</strong>
              {f.status === "archived" && <span className="badge">Archivé</span>}
              <div className="muted">Volume : {formatQty(f.volume_ml, "ml")}</div>
            </div>
            {canEdit && (
              <div>
                <button type="button" className="btn-small" disabled={busy} onClick={() => openEdit(f)}>
                  Modifier
                </button>{" "}
                {f.status === "active" ? (
                  <button
                    type="button"
                    className="btn-small danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Archiver ce format ? L'historique est conservé.")) setStatus(f, "archived");
                    }}
                  >
                    Archiver
                  </button>
                ) : (
                  <button type="button" className="btn-small" disabled={busy} onClick={() => setStatus(f, "active")}>
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
