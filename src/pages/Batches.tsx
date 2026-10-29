import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatDZD } from "../lib/format";
import { formatCost, formatQty } from "../lib/units";

const PAGE = 30;

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
};

const frDate = (d: string) => d.split("-").reverse().join("/");

export default function Batches() {
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";

  const [rows, setRows] = useState<Batch[]>([]);
  const [perfumes, setPerfumes] = useState<Record<string, string>>({});
  const [recipes, setRecipes] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  async function fetchRows(offset: number): Promise<Batch[] | null> {
    if (!supabase || !company) return null;
    const db = supabase;
    const { data, error: err } = await db
      .from("production_batches")
      .select(
        "id, batch_no, recipe_id, version_id, perfume_id, produced_date, planned_volume_ml, theoretical_yield_ml, actual_volume_ml, volume_variance_ml, bulk_remaining_ml, total_cost, cost_per_ml"
      )
      .eq("company_id", company.id)
      .order("produced_date", { ascending: false })
      .order("batch_no", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (err) {
      setError("Chargement impossible. Réessayez.");
      return null;
    }
    const list: Batch[] = (data ?? []).map((b: Batch) => ({
      ...b,
      planned_volume_ml: Number(b.planned_volume_ml),
      theoretical_yield_ml: Number(b.theoretical_yield_ml),
      actual_volume_ml: Number(b.actual_volume_ml),
      volume_variance_ml: Number(b.volume_variance_ml),
      bulk_remaining_ml: Number(b.bulk_remaining_ml),
      total_cost: Number(b.total_cost),
      cost_per_ml: Number(b.cost_per_ml),
    }));
    const vids = Array.from(new Set(list.map((b) => b.version_id)));
    if (vids.length > 0) {
      const { data: v } = await db.from("recipe_versions").select("id, version_no").in("id", vids);
      const map: Record<string, number> = {};
      (v ?? []).forEach((x: { id: string; version_no: number }) => { map[x.id] = x.version_no; });
      setVersions((old) => ({ ...old, ...map }));
    }
    setHasMore(list.length === PAGE);
    return list;
  }

  useEffect(() => {
    async function names() {
      if (!supabase || !company || !allowed) return;
      const db = supabase;
      const [p, r] = await Promise.all([
        db.from("perfumes").select("id, name").eq("company_id", company.id),
        db.from("recipes").select("id, name").eq("company_id", company.id),
      ]);
      const pm: Record<string, string> = {};
      (p.data ?? []).forEach((x: { id: string; name: string }) => { pm[x.id] = x.name; });
      const rm: Record<string, string> = {};
      (r.data ?? []).forEach((x: { id: string; name: string }) => { rm[x.id] = x.name; });
      setPerfumes(pm);
      setRecipes(rm);
    }
    names();
  }, [company, allowed]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchRows(0).then((list) => {
      if (cancelled) return;
      if (list) setRows(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [company, allowed]); // eslint-disable-line

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    const list = await fetchRows(rows.length);
    if (list) setRows((old) => [...old, ...list]);
    setLoading(false);
  }

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/fabrication">← Fabrication</Link>
        <h1>Lots de fabrication</h1>
        <div className="card empty">
          <p className="muted">Les lots sont réservés aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link className="back-link" to="/fabrication">← Fabrication</Link>
      <h1>Lots de fabrication</h1>
      {error && <p className="msg error">{error}</p>}
      <Link className="btn btn-link" to="/fabrication/lots/nouveau">Nouvelle fabrication</Link>

      {!loading && rows.length === 0 && !error && (
        <div className="card empty" style={{ marginTop: 12 }}>
          <p className="muted">Aucun lot enregistré.</p>
        </div>
      )}

      {rows.map((b) => (
        <div className="card" key={b.id} style={{ marginTop: 12 }}>
          <strong>Lot n° {b.batch_no}</strong>
          <div className="muted">
            {frDate(b.produced_date)} · {perfumes[b.perfume_id] ?? "—"} · {recipes[b.recipe_id] ?? "—"}
            {versions[b.version_id] ? " (version " + versions[b.version_id] + ")" : ""}
          </div>
          <div>
            Obtenu : <strong>{formatQty(b.actual_volume_ml, "ml")}</strong>
            <span className="muted"> (prévu {formatQty(b.planned_volume_ml, "ml")}, théorique {formatQty(b.theoretical_yield_ml, "ml")})</span>
          </div>
          <div className={b.volume_variance_ml < 0 ? "qty-neg" : b.volume_variance_ml > 0 ? "qty-pos" : "muted"}>
            Écart : {(b.volume_variance_ml > 0 ? "+ " : b.volume_variance_ml < 0 ? "− " : "") + formatQty(Math.abs(b.volume_variance_ml), "ml")}
          </div>
          <div>
            Coût : <strong>{formatDZD(b.total_cost)}</strong> · {formatCost(b.cost_per_ml, "ml")}
          </div>
          <div className="muted">Reste en vrac (non conditionné) : {formatQty(b.bulk_remaining_ml, "ml")}</div>
        </div>
      ))}

      {loading && <p className="muted">Chargement…</p>}
      {!loading && hasMore && (
        <button type="button" className="btn-small" onClick={loadMore}>Charger plus</button>
      )}
    </section>
  );
}
