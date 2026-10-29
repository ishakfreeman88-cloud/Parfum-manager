import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatDZD } from "../lib/format";
import { formatCost, formatQty } from "../lib/units";
import { newKey, parseNumber } from "../lib/movements";
import { dateStamp } from "../lib/csv";

type RecipeOpt = { id: string; name: string; perfume_id: string };
type Ver = { id: string; version_no: number; target_volume_ml: number; expected_yield_ml: number };
type Ing = { id: string; material_id: string; quantity_base: number };
type Mat = { id: string; name: string; unit: string; quantity_on_hand: number; avg_cost: number; status: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function NewBatch() {
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";
  const navigate = useNavigate();

  const [recipes, setRecipes] = useState<RecipeOpt[]>([]);
  const [perfumes, setPerfumes] = useState<Record<string, string>>({});
  const [recipeId, setRecipeId] = useState("");
  const [version, setVersion] = useState<Ver | null>(null);
  const [ings, setIngs] = useState<Ing[]>([]);
  const [mats, setMats] = useState<Record<string, Mat>>({});
  const [planned, setPlanned] = useState("");
  const [actual, setActual] = useState("");
  const [actualTouched, setActualTouched] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [date, setDate] = useState(dateStamp());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(newKey()); // une clé par saisie : un double envoi ne crée qu'un lot
  const submitting = useRef(false);
  const token = useRef(0);

  useEffect(() => {
    async function load() {
      if (!supabase || !company || !allowed) return;
      const db = supabase;
      const [r, p] = await Promise.all([
        db.from("recipes").select("id, name, perfume_id")
          .eq("company_id", company.id).eq("status", "active").order("name"),
        db.from("perfumes").select("id, name")
          .eq("company_id", company.id).eq("status", "active"),
      ]);
      if (r.error || p.error) {
        setError("Chargement impossible. Réessayez.");
        setLoading(false);
        return;
      }
      const names: Record<string, string> = {};
      (p.data ?? []).forEach((x: { id: string; name: string }) => { names[x.id] = x.name; });
      setPerfumes(names);
      setRecipes(((r.data ?? []) as RecipeOpt[]).filter((x) => names[x.perfume_id]));
      setLoading(false);
    }
    load();
  }, [company, allowed]);

  async function pickRecipe(id: string) {
    const mine = ++token.current;
    setRecipeId(id);
    setVersion(null);
    setIngs([]);
    setMats({});
    setOverrides({});
    setActualTouched(false);
    setError("");
    if (!id || !supabase || !company) return;
    setLoadingRecipe(true);
    const db = supabase;
    const { data: v, error: e1 } = await db.from("recipe_versions")
      .select("id, version_no, target_volume_ml, expected_yield_ml")
      .eq("recipe_id", id).eq("company_id", company.id)
      .order("version_no", { ascending: false }).limit(1);
    const last = v?.[0];
    if (e1 || !last) {
      if (mine === token.current) {
        setError("Cette recette n'a aucune version utilisable.");
        setLoadingRecipe(false);
      }
      return;
    }
    const ver: Ver = {
      id: last.id,
      version_no: last.version_no,
      target_volume_ml: Number(last.target_volume_ml),
      expected_yield_ml: Number(last.expected_yield_ml),
    };
    const { data: ing, error: e2 } = await db.from("recipe_ingredients")
      .select("id, material_id, quantity_base")
      .eq("version_id", ver.id).eq("company_id", company.id).order("line_no");
    const list: Ing[] = (ing ?? []).map((x: Ing) => ({ ...x, quantity_base: Number(x.quantity_base) }));
    const map: Record<string, Mat> = {};
    let e3 = false;
    if (!e2 && list.length > 0) {
      const { data: m, error: err } = await db.from("raw_materials")
        .select("id, name, unit, quantity_on_hand, avg_cost, status")
        .in("id", list.map((x) => x.material_id));
      e3 = Boolean(err);
      (m ?? []).forEach((x: Mat) => {
        map[x.id] = { ...x, quantity_on_hand: Number(x.quantity_on_hand), avg_cost: Number(x.avg_cost) };
      });
    }
    if (mine !== token.current) return; // une autre recette a été choisie entre-temps
    if (e2 || e3) {
      setError("Chargement impossible. Réessayez.");
      setLoadingRecipe(false);
      return;
    }
    setVersion(ver);
    setIngs(list);
    setMats(map);
    setPlanned(String(ver.target_volume_ml));
    setActual(String(ver.expected_yield_ml));
    setLoadingRecipe(false);
  }

  const plannedNum = parseNumber(planned);
  const validPlanned = Number.isFinite(plannedNum) && plannedNum > 0 && plannedNum <= 1000000;
  const factor = version && validPlanned ? plannedNum / version.target_volume_ml : 0;
  const theory = version && validPlanned ? r3(version.expected_yield_ml * factor) : 0;
  const actualNum = parseNumber(actual);
  const validActual = actual.trim() !== "" && Number.isFinite(actualNum) && actualNum > 0 && actualNum <= 1000000;

  function onPlannedChange(v: string) {
    setPlanned(v);
    const n = parseNumber(v);
    if (!actualTouched && version && Number.isFinite(n) && n > 0) {
      setActual(String(r3((version.expected_yield_ml * n) / version.target_volume_ml)));
    }
  }

  const rows = useMemo(
    () =>
      ings.map((i) => {
        const mat = mats[i.material_id];
        const plannedQty = r3(i.quantity_base * factor);
        const raw = overrides[i.id] ?? "";
        const hasOv = raw.trim() !== "";
        const ovNum = parseNumber(raw);
        const ovValid = hasOv && Number.isFinite(ovNum) && ovNum > 0;
        const actualQty = ovValid ? r3(ovNum) : plannedQty;
        const cost = mat ? r2(actualQty * mat.avg_cost) : 0;
        const enough = mat ? actualQty <= mat.quantity_on_hand : false;
        return { ing: i, mat, plannedQty, hasOv, ovNum, ovValid, actualQty, cost, enough };
      }),
    [ings, mats, factor, overrides]
  );

  const totalCost = r2(rows.reduce((s, r) => s + r.cost, 0));
  const costPerMl = validActual ? totalCost / actualNum : 0;
  const variance = validActual ? r3(actualNum - theory) : 0;
  const zeroCost = rows.some((r) => r.mat && r.mat.avg_cost === 0);

  function validate(): string {
    if (!version) return "Choisissez une recette.";
    if (!validPlanned) return "Le volume à fabriquer doit être compris entre 0 et 1 000 000 ml.";
    if (!validActual) return "Saisissez le volume réellement obtenu.";
    for (const r of rows) {
      if (!r.mat) return "Une matière de la recette est introuvable.";
      if (r.mat.status !== "active") return r.mat.name + " est archivée : restaurez-la avant de fabriquer.";
      if (r.hasOv && !r.ovValid) return r.mat.name + " : quantité réelle invalide.";
      if (r.plannedQty <= 0) return r.mat.name + " : quantité prévue trop petite pour ce volume.";
      if (!r.enough) return "Stock insuffisant pour " + r.mat.name + ".";
    }
    return "";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !supabase || !company || !version) return;
    setError("");
    const problem = validate();
    if (problem) return setError(problem);

    let msg =
      "Enregistrer ce lot ? Les matières seront retirées du stock immédiatement.\nCoût estimé : " +
      formatDZD(totalCost) + " pour " + formatQty(actualNum, "ml") + ".";
    if (theory > 0 && Math.abs(actualNum - theory) > theory * 0.1) {
      msg +=
        "\n\nATTENTION : le volume obtenu (" + formatQty(actualNum, "ml") +
        ") s'écarte de plus de 10 % du rendement théorique (" + formatQty(theory, "ml") +
        "). Vérifiez votre saisie.";
    }
    if (zeroCost) {
      msg += "\n\nATTENTION : une matière a un coût moyen nul, le coût du lot sera sous-estimé.";
    }
    if (!window.confirm(msg)) return;

    submitting.current = true;
    setBusy(true);
    const ov = rows
      .filter((r) => r.hasOv && r.mat)
      .map((r) => ({ material_id: r.ing.material_id, quantity: r.ovNum, unit: r.mat ? r.mat.unit : "ml" }));
    const { error: err } = await supabase.rpc("create_production_batch", {
      p_company: company.id,
      p_version: version.id,
      p_planned_ml: plannedNum,
      p_actual_ml: actualNum,
      p_date: date,
      p_notes: notes.trim() || null,
      p_key: keyRef.current,
      p_overrides: ov.length > 0 ? ov : null,
    });
    setBusy(false);
    submitting.current = false;
    if (err) {
      setError(err.code === "P0001" ? err.message : "Enregistrement impossible. Réessayez.");
      return;
    }
    keyRef.current = newKey();
    navigate("/fabrication/lots", { replace: true });
  }

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/fabrication">← Fabrication</Link>
        <h1>Nouvelle fabrication</h1>
        <div className="card empty">
          <p className="muted">Réservé aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }
  if (loading) return <p className="muted">Chargement…</p>;

  return (
    <section>
      <Link className="back-link" to="/fabrication/lots">← Lots</Link>
      <h1>Nouvelle fabrication</h1>
      {error && <p className="msg error">{error}</p>}

      {recipes.length === 0 && (
        <div className="card empty">
          <p className="muted">Aucune recette active. Créez d'abord une recette.</p>
          <Link className="menu-link" to="/fabrication/recettes">Aller aux recettes</Link>
        </div>
      )}

      {recipes.length > 0 && (
        <form onSubmit={onSubmit}>
          <div className="card">
            <label className="field">
              <span>Recette</span>
              <select value={recipeId} onChange={(e) => pickRecipe(e.target.value)}>
                <option value="">Choisir…</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} — {perfumes[r.perfume_id]}</option>
                ))}
              </select>
            </label>
            {loadingRecipe && <p className="muted">Chargement de la recette…</p>}
            {version && (
              <p className="muted">
                Version courante : n° {version.version_no} · volume cible {formatQty(version.target_volume_ml, "ml")} · rendement théorique {formatQty(version.expected_yield_ml, "ml")}
              </p>
            )}
          </div>

          {version && (
            <>
              <div className="card">
                <label className="field">
                  <span>Volume à fabriquer en ml</span>
                  <input value={planned} inputMode="decimal" onChange={(e) => onPlannedChange(e.target.value)} />
                </label>
                <label className="field">
                  <span>Volume réellement obtenu en ml</span>
                  <input
                    value={actual}
                    inputMode="decimal"
                    onChange={(e) => { setActual(e.target.value); setActualTouched(true); }}
                  />
                </label>
                <label className="field">
                  <span>Date de fabrication</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </label>
                <label className="field">
                  <span>Observations</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>

              {rows.map((r) => (
                <div className="card" key={r.ing.id}>
                  <strong>{r.mat ? r.mat.name : "Matière introuvable"}</strong>
                  {r.mat && r.mat.status !== "active" && <span className="badge warn">Archivée</span>}
                  {r.mat && (
                    <>
                      <div className="muted">
                        Prévu : {formatQty(r.plannedQty, r.mat.unit)} · Stock : {formatQty(r.mat.quantity_on_hand, r.mat.unit)}
                      </div>
                      <label className="field">
                        <span>Quantité réellement utilisée en {r.mat.unit === "unit" ? "unités" : r.mat.unit} (facultatif)</span>
                        <input
                          value={overrides[r.ing.id] ?? ""}
                          inputMode="decimal"
                          placeholder={String(r.plannedQty)}
                          onChange={(e) => setOverrides({ ...overrides, [r.ing.id]: e.target.value })}
                        />
                      </label>
                      <div>
                        Utilisé : <strong>{formatQty(r.actualQty, r.mat.unit)}</strong> · Coût : <strong>{formatDZD(r.cost)}</strong>
                      </div>
                      <div className="muted">Coût moyen : {formatCost(r.mat.avg_cost, r.mat.unit)}</div>
                      {!r.enough && <p className="msg error">Stock insuffisant pour cette quantité.</p>}
                      {r.mat.avg_cost === 0 && (
                        <p className="msg error">Coût moyen nul : le coût du lot sera sous-estimé.</p>
                      )}
                    </>
                  )}
                </div>
              ))}

              <div className="card">
                <div className="sum-row"><span>Rendement théorique</span><span>{formatQty(theory, "ml")}</span></div>
                <div className="sum-row">
                  <span>Volume obtenu</span>
                  <span>{validActual ? formatQty(actualNum, "ml") : "—"}</span>
                </div>
                <div className="sum-row">
                  <span>Écart</span>
                  <span className={variance < 0 ? "qty-neg" : variance > 0 ? "qty-pos" : ""}>
                    {validActual
                      ? (variance > 0 ? "+ " : variance < 0 ? "− " : "") + formatQty(Math.abs(variance), "ml")
                      : "—"}
                  </span>
                </div>
                <div className="sum-row total"><span>Coût du lot</span><span>{formatDZD(totalCost)}</span></div>
                <div className="sum-row">
                  <span>Coût par ml obtenu</span>
                  <span>{validActual ? formatCost(costPerMl, "ml") : "—"}</span>
                </div>
                <p className="muted">
                  Aperçu au coût moyen actuel du stock. Le coût par ml tient compte des pertes, car il est calculé sur le volume réellement obtenu. Flacons, étiquettes et emballages ne sont pas inclus : ils seront ajoutés au conditionnement.
                </p>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? "Veuillez patienter…" : "Enregistrer le lot"}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}
