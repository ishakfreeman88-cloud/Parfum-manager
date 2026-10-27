import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatQty, formatCost } from "../lib/units";
import { movementLabels } from "../lib/movements";
import { formatDateTime } from "../lib/format";

const PAGE = 30;

type Mv = {
  id: string;
  material_id: string;
  movement_type: string;
  quantity_delta: number;
  unit_cost: number;
  quantity_after: number;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
type MatInfo = { id: string; name: string; unit: string };

export default function Movements() {
  const { company, role } = useCompany();
  const canView = role !== "seller";

  const [mats, setMats] = useState<MatInfo[]>([]);
  const [rows, setRows] = useState<Mv[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  async function fetchRows(offset: number): Promise<Mv[] | null> {
    if (!supabase || !company) return null;
    let q = supabase
      .from("stock_movements")
      .select("id, material_id, movement_type, quantity_delta, unit_cost, quantity_after, reason, notes, created_by, created_at")
      .eq("company_id", company.id);
    if (materialFilter) q = q.eq("material_id", materialFilter);
    if (typeFilter) q = q.eq("movement_type", typeFilter);
    const { data, error: err } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (err) {
      setError("Chargement impossible. Réessayez.");
      return null;
    }
    const list = (data ?? []).map((r: Mv) => ({
      ...r,
      quantity_delta: Number(r.quantity_delta),
      unit_cost: Number(r.unit_cost),
      quantity_after: Number(r.quantity_after),
    }));
    const ids = Array.from(new Set(list.map((r: Mv) => r.created_by).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (p ?? []).forEach((x: { id: string; full_name: string | null }) => {
        map[x.id] = x.full_name ?? "";
      });
      setNames((old) => ({ ...old, ...map }));
    }
    setHasMore(list.length === PAGE);
    return list;
  }

  useEffect(() => {
    if (!supabase || !company || !canView) return;
    supabase
      .from("raw_materials")
      .select("id, name, unit")
      .eq("company_id", company.id)
      .order("name")
      .then(({ data }) => setMats((data ?? []) as MatInfo[]));
  }, [company, canView]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchRows(0).then((list) => {
      if (cancelled) return;
      if (list) setRows(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [company, materialFilter, typeFilter, canView]); // eslint-disable-line

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    const list = await fetchRows(rows.length);
    if (list) setRows((old) => [...old, ...list]);
    setLoading(false);
  }

  if (!canView) {
    return (
      <section>
        <Link className="back-link" to="/stock">← Stock</Link>
        <h1>Historique des mouvements</h1>
        <div className="card empty">
          <p className="muted">Cet historique n'est pas accessible avec votre rôle.</p>
        </div>
      </section>
    );
  }

  const matOf = (id: string) => mats.find((m) => m.id === id);

  return (
    <section>
      <Link className="back-link" to="/stock">← Stock</Link>
      <h1>Historique des mouvements</h1>
      {error && <p className="msg error">{error}</p>}

      <div className="toolbar">
        <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
          <option value="">Toutes les matières</option>
          {mats.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(movementLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {!loading && rows.length === 0 && (
        <div className="card empty">
          <p className="muted">Aucun mouvement enregistré.</p>
        </div>
      )}

      {rows.map((r) => {
        const m = matOf(r.material_id);
        const unit = m?.unit ?? "unit";
        const positive = r.quantity_delta > 0;
        return (
          <div className="card" key={r.id}>
            <div className="row" style={{ borderTop: 0, padding: 0 }}>
              <div className="row-main">
                <strong>{movementLabels[r.movement_type] ?? r.movement_type}</strong>
                <span className="muted"> · {m?.name ?? "Matière"}</span>
                <div className={positive ? "qty-pos" : "qty-neg"}>
                  {positive ? "+" : "−"} {formatQty(Math.abs(r.quantity_delta), unit)}
                </div>
                <div className="muted">Stock après : {formatQty(r.quantity_after, unit)}</div>
                <div className="muted">Coût : {formatCost(r.unit_cost, unit)}</div>
                {r.reason && <div>Motif : {r.reason}</div>}
                {r.notes && <div className="muted">{r.notes}</div>}
                <div className="muted">
                  {formatDateTime(r.created_at)} · {r.created_by ? names[r.created_by] || "Ancien membre" : "Système"}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {loading && <p className="muted">Chargement…</p>}
      {!loading && hasMore && (
        <button type="button" className="btn-small" onClick={loadMore}>
          Charger plus
        </button>
      )}
    </section>
  );
}
