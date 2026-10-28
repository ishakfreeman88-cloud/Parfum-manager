import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatQty } from "../lib/units";
import { inputUnits, newKey, parseNumber } from "../lib/movements";
import { dateStamp } from "../lib/csv";

type Perfume = { id: string; name: string };
type Mat = { id: string; name: string; unit: string; material_type: string };
type Line = { uid: string; materialId: string; qty: string; unit: string };

const NOT_IN_RECIPE = ["bottle", "cap", "label", "box"];
const emptyLine = (): Line => ({ uid: newKey(), materialId: "", qty: "", unit: "" });

export default function RecipeForm() {
  const { id } = useParams(); // présent : nouvelle version d'une recette existante
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";
  const navigate = useNavigate();

  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [mats, setMats] = useState<Mat[]>([]);
  const [perfumeId, setPerfumeId] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("100");
  const [yieldMl, setYieldMl] = useState("100");
  const [instructions, setInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [effective, setEffective] = useState(dateStamp());
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [recipeName, setRecipeName] = useState("");
  const [nextNo, setNextNo] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(newKey()); // une clé par saisie : un double envoi ne crée qu'une version
  const submitting = useRef(false);

  useEffect(() => {
    async function load() {
      if (!supabase || !company || !allowed) return;
      const db = supabase;
      const [p, m] = await Promise.all([
        db.from("perfumes").select("id, name")
          .eq("company_id", company.id).eq("status", "active").order("name"),
        db.from("raw_materials").select("id, name, unit, material_type")
          .eq("company_id", company.id).eq("status", "active").order("name"),
      ]);
      if (p.error || m.error) {
        setError("Chargement impossible. Réessayez.");
        setLoading(false);
        return;
      }
      setPerfumes((p.data ?? []) as Perfume[]);
      setMats(((m.data ?? []) as Mat[]).filter((x) => !NOT_IN_RECIPE.includes(x.material_type)));

      if (id) {
        const { data: r } = await db.from("recipes").select("id, name, perfume_id")
          .eq("id", id).eq("company_id", company.id).maybeSingle();
        if (!r) {
          setError("Recette introuvable.");
          setLoading(false);
          return;
        }
        setRecipeName(r.name);
        setPerfumeId(r.perfume_id);
        const { data: v } = await db.from("recipe_versions")
          .select("id, version_no, target_volume_ml, expected_yield_ml, instructions, notes")
          .eq("recipe_id", id).eq("company_id", company.id)
          .order("version_no", { ascending: false }).limit(1);
        const last = v?.[0];
        if (last) {
          setNextNo(last.version_no + 1);
          setTarget(String(Number(last.target_volume_ml)));
          setYieldMl(String(Number(last.expected_yield_ml)));
          setInstructions(last.instructions ?? "");
          setNotes(last.notes ?? "");
          const { data: ing } = await db.from("recipe_ingredients")
            .select("material_id, quantity_input, unit_input")
            .eq("version_id", last.id).eq("company_id", company.id).order("line_no");
          const prefilled = (ing ?? []).map(
            (x: { material_id: string; quantity_input: number | string; unit_input: string }) => ({
              uid: newKey(),
              materialId: x.material_id,
              qty: String(Number(x.quantity_input)),
              unit: x.unit_input,
            })
          );
          if (prefilled.length > 0) setLines(prefilled);
        }
      }
      setLoading(false);
    }
    load();
  }, [company, id, allowed]);

  const rows = useMemo(
    () =>
      lines.map((l) => {
        const mat = mats.find((m) => m.id === l.materialId);
        const q = parseNumber(l.qty);
        const info = mat ? inputUnits[mat.unit]?.find((u) => u.code === l.unit) : undefined;
        const valid = Boolean(mat && info) && l.qty.trim() !== "" && Number.isFinite(q) && q > 0;
        return { mat, q, info, valid, base: valid && info ? q * info.factor : 0 };
      }),
    [lines, mats]
  );
  const mlTotal = rows.reduce((s, r) => s + (r.valid && r.mat?.unit === "ml" ? r.base : 0), 0);

  function updateLine(uid: string, patch: Partial<Line>) {
    setLines((old) => old.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }
  function pickMaterial(uid: string, matId: string) {
    const m = mats.find((x) => x.id === matId);
    updateLine(uid, { materialId: matId, unit: m ? m.unit : "" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !supabase || !company) return;
    setError("");
    const t = parseNumber(target);
    const y = parseNumber(yieldMl);
    if (!id && !perfumeId) return setError("Choisissez un parfum.");
    if (!id && name.trim().length < 2) return setError("Le nom de la recette doit contenir au moins 2 caractères.");
    if (!Number.isFinite(t) || t <= 0) return setError("Le volume cible doit être supérieur à zéro.");
    if (!Number.isFinite(y) || y <= 0) return setError("Le rendement théorique doit être supérieur à zéro.");
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].valid) return setError("Ligne " + (i + 1) + " : choisissez une matière disponible et une quantité valide.");
    }
    const ids = lines.map((l) => l.materialId);
    if (new Set(ids).size !== ids.length) return setError("Une matière apparaît deux fois dans la recette.");
    const label = id ? "la version " + nextNo : "cette recette";
    if (!window.confirm("Enregistrer " + label + " ? Elle ne pourra plus être modifiée, seulement remplacée par une nouvelle version.")) return;

    submitting.current = true;
    setBusy(true);
    const { error: err } = await supabase.rpc("create_recipe_version", {
      p_company: company.id,
      p_perfume: perfumeId || null,
      p_recipe: id ?? null,
      p_name: id ? null : name.trim(),
      p_target_ml: t,
      p_yield_ml: y,
      p_instructions: instructions.trim() || null,
      p_notes: notes.trim() || null,
      p_effective: effective,
      p_key: keyRef.current,
      p_items: lines.map((l) => ({ material_id: l.materialId, quantity: parseNumber(l.qty), unit: l.unit })),
    });
    setBusy(false);
    submitting.current = false;
    if (err) {
      setError(err.code === "P0001" ? err.message : "Enregistrement impossible. Réessayez.");
      return;
    }
    keyRef.current = newKey();
    navigate("/fabrication/recettes", { replace: true });
  }

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/fabrication/recettes">← Recettes</Link>
        <h1>Recette</h1>
        <div className="card empty">
          <p className="muted">Réservé aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }
  if (loading) return <p className="muted">Chargement…</p>;

  return (
    <section>
      <Link className="back-link" to="/fabrication/recettes">← Recettes</Link>
      <h1>{id ? "Version " + nextNo + " de « " + recipeName + " »" : "Nouvelle recette"}</h1>
      {error && <p className="msg error">{error}</p>}
      {id && (
        <p className="muted">
          Les quantités de la version précédente sont reprises. L'ancienne version reste conservée pour les fabrications déjà faites.
        </p>
      )}

      <form onSubmit={onSubmit}>
        <div className="card">
          {!id && (
            <>
              <label className="field">
                <span>Parfum</span>
                <select value={perfumeId} onChange={(e) => setPerfumeId(e.target.value)}>
                  <option value="">Choisir…</option>
                  {perfumes.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Nom de la recette</span>
                <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </label>
            </>
          )}
          <label className="field">
            <span>Volume cible en ml (les quantités ci-dessous donnent ce volume)</span>
            <input value={target} inputMode="decimal" onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="field">
            <span>Rendement théorique en ml</span>
            <input value={yieldMl} inputMode="decimal" onChange={(e) => setYieldMl(e.target.value)} />
          </label>
          <label className="field">
            <span>Date d'entrée en vigueur</span>
            <input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} required />
          </label>
          <label className="field">
            <span>Instructions</span>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        {lines.map((l, i) => {
          const row = rows[i];
          const units = row.mat ? inputUnits[row.mat.unit] ?? [] : [];
          return (
            <div className="card" key={l.uid}>
              <div className="row" style={{ borderTop: 0, padding: 0 }}>
                <h2 style={{ margin: 0 }}>Ingrédient {i + 1}</h2>
                {lines.length > 1 && (
                  <button type="button" className="btn-small danger"
                    onClick={() => setLines((old) => old.filter((x) => x.uid !== l.uid))}>
                    Retirer
                  </button>
                )}
              </div>
              <label className="field">
                <span>Matière</span>
                <select value={l.materialId} onChange={(e) => pickMaterial(l.uid, e.target.value)}>
                  <option value="">Choisir…</option>
                  {mats.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              {row.mat && (
                <>
                  <label className="field">
                    <span>Quantité pour le volume cible</span>
                    <input value={l.qty} inputMode="decimal" onChange={(e) => updateLine(l.uid, { qty: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Unité</span>
                    <select value={l.unit} onChange={(e) => updateLine(l.uid, { unit: e.target.value })}>
                      {units.map((u) => (
                        <option key={u.code} value={u.code}>{u.label}</option>
                      ))}
                    </select>
                  </label>
                  {row.valid && row.info && (
                    <p className="muted">Soit {formatQty(row.base, row.mat.unit)} en stock.</p>
                  )}
                </>
              )}
            </div>
          );
        })}

        {lines.length < 50 && (
          <button type="button" className="btn-small" onClick={() => setLines((old) => [...old, emptyLine()])}>
            + Ajouter un ingrédient
          </button>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <p>Somme des ingrédients en ml : <strong>{formatQty(mlTotal, "ml")}</strong></p>
          <p className="muted">
            Indicatif : les ingrédients en grammes ne sont pas convertis en ml. Le rendement reste celui que vous saisissez.
          </p>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Veuillez patienter…" : id ? "Enregistrer la version " + nextNo : "Enregistrer la recette"}
          </button>
        </div>
      </form>
    </section>
  );
}
