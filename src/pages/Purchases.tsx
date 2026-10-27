import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatDZD } from "../lib/format";

const PAGE = 30;

type Purchase = {
  id: string;
  purchase_no: number;
  supplier_id: string | null;
  purchase_date: string;
  invoice_ref: string | null;
  total: number;
  amount_paid: number;
  amount_due: number;
  payment_status: "unpaid" | "partial" | "paid";
  status: "received" | "cancelled";
};

const payLabels: Record<string, string> = { unpaid: "Non payé", partial: "Partiel", paid: "Payé" };

function frDate(d: string): string {
  const [y, m, day] = d.split("-");
  return day + "/" + m + "/" + y;
}

export default function Purchases() {
  const { company, role } = useCompany();
  const canView = role !== "seller";
  const canCreate = role === "admin" || role === "manager";

  const [rows, setRows] = useState<Purchase[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");

  async function fetchRows(offset: number): Promise<Purchase[] | null> {
    if (!supabase || !company) return null;
    let q = supabase
      .from("purchases")
      .select("id, purchase_no, supplier_id, purchase_date, invoice_ref, total, amount_paid, amount_due, payment_status, status")
      .eq("company_id", company.id);
    if (statusFilter) q = q.eq("status", statusFilter);
    if (payFilter === "due") q = q.in("payment_status", ["unpaid", "partial"]).eq("status", "received");
    if (payFilter === "paid") q = q.eq("payment_status", "paid");
    const { data, error: err } = await q
      .order("purchase_date", { ascending: false })
      .order("purchase_no", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (err) {
      setError("Chargement impossible. Réessayez.");
      return null;
    }
    const list = (data ?? []).map((r: Purchase) => ({
      ...r,
      total: Number(r.total),
      amount_paid: Number(r.amount_paid),
      amount_due: Number(r.amount_due),
    }));
    setHasMore(list.length === PAGE);
    return list;
  }

  useEffect(() => {
    if (!supabase || !company || !canView) return;
    supabase.from("suppliers").select("id, name").eq("company_id", company.id)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((s: { id: string; name: string }) => { map[s.id] = s.name; });
        setNames(map);
      });
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
    return () => { cancelled = true; };
  }, [company, statusFilter, payFilter, canView]); // eslint-disable-line

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
        <h1>Achats</h1>
        <div className="card empty">
          <p className="muted">Les achats ne sont pas accessibles avec votre rôle.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link className="back-link" to="/stock">← Stock</Link>
      <h1>Achats</h1>
      {error && <p className="msg error">{error}</p>}

      {canCreate && (
        <Link className="btn btn-link" to="/stock/achats/nouveau">Nouvel achat</Link>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tous les achats</option>
          <option value="received">Reçus</option>
          <option value="cancelled">Annulés</option>
        </select>
        <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
          <option value="">Tous les paiements</option>
          <option value="due">Reste dû</option>
          <option value="paid">Soldés</option>
        </select>
      </div>

      {!loading && rows.length === 0 && (
        <div className="card empty">
          <p className="muted">Aucun achat enregistré.</p>
        </div>
      )}

      {rows.map((p) => (
        <div className="card" key={p.id}>
          <strong>Achat n° {p.purchase_no}</strong>
          {p.status === "cancelled" ? (
            <span className="badge warn">Annulé</span>
          ) : (
            <span className={p.payment_status === "paid" ? "badge" : "badge warn"}>{payLabels[p.payment_status]}</span>
          )}
          <div className="muted">
            {frDate(p.purchase_date)}
            {p.supplier_id && names[p.supplier_id] ? " · " + names[p.supplier_id] : ""}
            {p.invoice_ref ? " · Facture " + p.invoice_ref : ""}
          </div>
          <div>Total : <strong>{formatDZD(p.total)}</strong></div>
          {p.status === "received" && p.amount_due > 0 && (
            <div className="qty-neg">Reste dû : {formatDZD(p.amount_due)}</div>
          )}
        </div>
      ))}

      {loading && <p className="muted">Chargement…</p>}
      {!loading && hasMore && (
        <button type="button" className="btn-small" onClick={loadMore}>Charger plus</button>
      )}
    </section>
  );
}
