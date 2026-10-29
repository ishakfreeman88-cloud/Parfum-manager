import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatDZD, formatDateTime } from "../lib/format";
import { formatCost, formatQty } from "../lib/units";

type Batch = {
  id: string;
  batch_no: number;
  recipe_id: string;
  version_id: string;
  perfume_id: string;
  produced_date: string;
  planned_volume_ml: number;
  theoretical_yield_ml: number;
  actual_volume_ml: number;
  volume_variance_ml: number;
  bulk_remaining_ml: number;
  total_cost: number;
  cost_per_ml: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
type Cons = {
  id: string;
  line_no: number;
  material_id: string;
  planned_qty_base: number;
  actual_qty_base: number;
  unit_cost: number;
  line_cost: number;
};
type Mat = { id: string; name: string; unit: string };

const frDate = (d: string) => d.split("-").reverse().join("/");

export default function BatchDetail() {
  const { id } = useParams();
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";

  const [batch, setBatch] = useState<Batch | null>(null);
  const [cons, setCons] = useState<Cons[]>([]);
  const [mats, setMats] = useState<Record<string, Mat>>({});
  const [perfume, setPerfume] = useState("");
  const [recipe, setRecipe] = useState("");
  const [versionNo, setVersionNo] = useState<number | null>(null);
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !company || !id || !allowed) return;
      const db = supabase;
      const { data: b, error: e1 } = await db
        .from("production_batches")
        .select(
          "id, batch_no, recipe_id, version_id, perfume_id, produced_date, planned_volume_ml, theoretical_yield_ml, actual_volume_ml, volume_variance_ml, bulk_remaining_ml, total_cost, cost_per_ml, notes, created_by, created_at"
        )
        .eq("id", id)
        .eq("company_id", company.id)
        .maybeSingle();
      if (cancelled) return;
      if (e1) {
        setError("Chargement impossible. Réessayez.");
        setLoading(false);
        return;
      }
      if (!b) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const bt: Batch = {
        ...(b as Batch),
        planned_volume_ml: Number(b.planned_volume_ml),
        theoretical_yield_ml: Number(b.theoretical_yield_ml),
        actual_volume_ml: Number(b.actual_volume_ml),
        volume_variance_ml: Number(b.volume_variance_ml),
        bulk_remaining_ml: Number(b.bulk_remaining_ml),
        total_cost: Number(b.total_cost),
        cost_per_ml: Number(b.cost_per_ml),
      };
      const [c, p, r, v, u] = await Promise.all([
        db.from("production_consumptions")
          .select("id, line_no, material_id, planned_qty_base, actual_qty_base, unit_cost, line_cost")
          .eq("batch_id", id).eq("company_id", company.id).order("line_no"),
        db.from("perfumes").select("name").eq("id", bt.perfume_id).maybeSingle(),
        db.from("recipes").select("name").eq("id", bt.recipe_id).maybeSingle(),
        db.from("recipe_versions").select("version_no").eq("id", bt.version_id).maybeSingle(),
        bt.created_by
          ? db.from("profiles").select("full_name").eq("id", bt.created_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      if (c.error) {
        setError("Chargement impossible. Réessayez.");
        setLoading(false);
        return;
      }
      const list: Cons[] = (c.data ?? []).map((x: Cons) => ({
        ...x,
        planned_qty_base: Number(x.planned_qty_base),
        actual_qty_base: Number(x.actual_qty_base),
        unit_cost: Number(x.unit_cost),
        line_cost: Number(x.line_cost),
      }));
      const ids = Array.from(new Set(list.map((x) => x.material_id)));
      const map: Record<string, Mat> = {};
      if (ids.length > 0) {
        const { data: m } = await db.from("raw_materials").select("id, name, unit").in("id", ids);
        (m ?? []).forEach((x: Mat) => { map[x.id] = x; });
      }
      if (cancelled) return;
      setBatch(bt);
      setCons(list);
      setMats(map);
      setPerfume(p.data?.name ?? "");
      setRecipe(r.data?.name ?? "");
      setVersionNo(v.data?.version_no ?? null);
      setAuthor(u.data?.full_name ?? "");
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [company, id, allowed]);

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/fabrication/lots">← Lots</Link>
        <h1>Lot de fabrication</h1>
        <div className="card empty">
          <p className="muted">Les lots sont réservés aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }
  if (loading) return <p className="muted">Chargement…</p>;
  if (notFound || !batch) {
    return (
      <section>
        <Link className="back-link" to="/fabrication/lots">← Lots</Link>
        <h1>Lot introuvable</h1>
        {error && <p className="msg error">{error}</p>}
      </section>
    );
  }

  const sumCents = cons.reduce((s, x) => s + Math.round(x.line_cost * 100), 0);
  const gap = Math.round(batch.total_cost * 100) - sumCents;
  const v = batch.volume_variance_ml;

  return (
    <section>
      <Link className="back-link" to="/fabrication/lots">← Lots</Link>
      <h1>Lot n° {batch.batch_no}</h1>
      {error && <p className="msg error">{error}</p>}

      <div className="card">
        <div className="muted">
          {frDate(batch.produced_date)} · {perfume || "—"} · {recipe || "—"}
          {versionNo ? " (version " + versionNo + ")" : ""}
        </div>
        <div className="muted">
          Saisi le {formatDateTime(batch.created_at)}
          {batch.created_by ? " par " + (author || "un ancien membre") : ""}
        </div>
        {batch.notes && <p>{batch.notes}</p>}
      </div>

      <div className="card">
        <h2>Volumes</h2>
        <div className="sum-row"><span>Volume à fabriquer</span><span>{formatQty(batch.planned_volume_ml, "ml")}</span></div>
        <div className="sum-row"><span>Rendement théorique</span><span>{formatQty(batch.theoretical_yield_ml, "ml")}</span></div>
        <div className="sum-row"><span>Volume obtenu</span><span>{formatQty(batch.actual_volume_ml, "ml")}</span></div>
        <div className="sum-row">
          <span>Écart (pertes)</span>
          <span className={v < 0 ? "qty-neg" : v > 0 ? "qty-pos" : ""}>
            {(v > 0 ? "+ " : v < 0 ? "− " : "") + formatQty(Math.abs(v), "ml")}
          </span>
        </div>
        <div className="sum-row total">
          <span>Reste en vrac (non conditionné)</span>
          <span>{formatQty(batch.bulk_remaining_ml, "ml")}</span>
        </div>
      </div>

      <div className="card">
        <h2>Matières consommées</h2>
        {cons.map((x) => {
          const m = mats[x.material_id];
          const unit = m?.unit ?? "unit";
          const diff = Math.round((x.actual_qty_base - x.planned_qty_base) * 1000) / 1000;
          return (
            <div className="row" key={x.id}>
              <div className="row-main">
                <strong>{m?.name ?? "Matière"}</strong>
                <div>
                  Utilisé : <strong>{formatQty(x.actual_qty_base, unit)}</strong>
                  <span className="muted"> (prévu {formatQty(x.planned_qty_base, unit)})</span>
                </div>
                {diff !== 0 && (
                  <div className={diff > 0 ? "qty-neg" : "qty-pos"}>
                    {diff > 0 ? "+ " : "− "}{formatQty(Math.abs(diff), unit)} par rapport au prévu
                  </div>
                )}
                <div className="muted">
                  Coût unitaire : {formatCost(x.unit_cost, unit)} · Ligne : {formatDZD(x.line_cost)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>Coût</h2>
        <div className="sum-row total"><span>Coût du lot</span><span>{formatDZD(batch.total_cost)}</span></div>
        <div className="sum-row"><span>Coût par ml obtenu</span><span>{formatCost(batch.cost_per_ml, "ml")}</span></div>
        {gap !== 0 && (
          <p className="msg error">
            Attention : la somme des lignes ({formatDZD(sumCents / 100)}) diffère du coût enregistré. Signalez-le.
          </p>
        )}
        <p className="muted">
          Coût des matières au coût moyen du jour de la fabrication, divisé par le volume réellement obtenu : les pertes sont comprises. Flacons, étiquettes et emballages seront ajoutés au conditionnement.
        </p>
      </div>
    </section>
  );
}
