import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatDZD, formatDateTime } from "../lib/format";
import { formatCost, formatQty } from "../lib/units";
import { newKey, parseNumber } from "../lib/movements";
import { dateStamp } from "../lib/csv";

type Purchase = {
  id: string;
  purchase_no: number;
  supplier_id: string | null;
  purchase_date: string;
  invoice_ref: string | null;
  subtotal: number;
  discount: number;
  extra_fees: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  payment_status: "unpaid" | "partial" | "paid";
  status: "received" | "cancelled";
  cancel_reason: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
type Item = {
  id: string;
  line_no: number;
  material_id: string;
  quantity_input: number;
  unit_input: string;
  quantity_base: number;
  unit_price_input: number;
  line_total: number;
  landed_total: number;
  cost_per_base: number;
  supplier_lot: string | null;
  expiry_date: string | null;
};
type Payment = {
  id: string;
  amount: number;
  paid_at: string;
  method: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
type MatInfo = { id: string; name: string; unit: string };

const methods = ["Espèces", "Virement", "Chèque", "Paiement électronique", "Autre"];
const payLabels: Record<string, string> = { unpaid: "Non payé", partial: "Partiel", paid: "Payé" };
const frDate = (d: string) => d.split("-").reverse().join("/");

export default function PurchaseDetail() {
  const { id } = useParams();
  const { company, role } = useCompany();
  const canView = role !== "seller";
  const canEdit = role === "admin" || role === "manager";

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [mats, setMats] = useState<Record<string, MatInfo>>({});
  const [supplierName, setSupplierName] = useState("");
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(dateStamp());
  const [method, setMethod] = useState(methods[0]);
  const [payNotes, setPayNotes] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");

  const payKey = useRef(newKey()); // une clé par saisie de paiement
  const submitting = useRef(false);

  const load = useCallback(async () => {
    if (!supabase || !company || !id || !canView) return;
    setLoading(true);
    const db = supabase;
    const { data: p, error: e1 } = await db
      .from("purchases")
      .select(
        "id, purchase_no, supplier_id, purchase_date, invoice_ref, subtotal, discount, extra_fees, total, amount_paid, amount_due, payment_status, status, cancel_reason, cancelled_at, notes, created_by, created_at"
      )
      .eq("id", id)
      .eq("company_id", company.id)
      .maybeSingle();
    if (e1) {
      setError("Chargement impossible. Réessayez.");
      setLoading(false);
      return;
    }
    if (!p) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setNotFound(false);
    const pu: Purchase = {
      ...(p as Purchase),
      subtotal: Number(p.subtotal),
      discount: Number(p.discount),
      extra_fees: Number(p.extra_fees),
      total: Number(p.total),
      amount_paid: Number(p.amount_paid),
      amount_due: Number(p.amount_due),
    };
    setPurchase(pu);

    const [it, pay] = await Promise.all([
      db.from("purchase_items")
        .select("id, line_no, material_id, quantity_input, unit_input, quantity_base, unit_price_input, line_total, landed_total, cost_per_base, supplier_lot, expiry_date")
        .eq("purchase_id", id).eq("company_id", company.id).order("line_no"),
      db.from("purchase_payments")
        .select("id, amount, paid_at, method, notes, created_by, created_at")
        .eq("purchase_id", id).eq("company_id", company.id).order("created_at"),
    ]);
    if (it.error || pay.error) {
      setError("Chargement impossible. Réessayez.");
      setLoading(false);
      return;
    }
    const itemList = (it.data ?? []).map((r: Item) => ({
      ...r,
      quantity_input: Number(r.quantity_input),
      quantity_base: Number(r.quantity_base),
      unit_price_input: Number(r.unit_price_input),
      line_total: Number(r.line_total),
      landed_total: Number(r.landed_total),
      cost_per_base: Number(r.cost_per_base),
    }));
    const payList = (pay.data ?? []).map((r: Payment) => ({ ...r, amount: Number(r.amount) }));
    setItems(itemList);
    setPayments(payList);

    const matIds = Array.from(new Set(itemList.map((r: Item) => r.material_id)));
    if (matIds.length > 0) {
      const { data: m } = await db.from("raw_materials").select("id, name, unit").in("id", matIds);
      const map: Record<string, MatInfo> = {};
      (m ?? []).forEach((x: MatInfo) => { map[x.id] = x; });
      setMats(map);
    }
    if (pu.supplier_id) {
      const { data: s } = await db.from("suppliers").select("name").eq("id", pu.supplier_id).maybeSingle();
      setSupplierName(s?.name ?? "");
    } else {
      setSupplierName("");
    }
    const userIds = Array.from(
      new Set([pu.created_by, ...payList.map((x: Payment) => x.created_by)].filter(Boolean))
    ) as string[];
    if (userIds.length > 0) {
      const { data: u } = await db.from("profiles").select("id, full_name").in("id", userIds);
      const map: Record<string, string> = {};
      (u ?? []).forEach((x: { id: string; full_name: string | null }) => { map[x.id] = x.full_name ?? ""; });
      setUsers(map);
    }
    setLoading(false);
  }, [company, id, canView]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPay(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !supabase || !company || !purchase) return;
    setError("");
    setInfo("");
    const amt = parseNumber(amount);
    if (amount.trim() === "" || !Number.isFinite(amt) || amt <= 0) return setError("Saisissez un montant valide.");
    if (amt > purchase.amount_due) return setError("Le paiement dépasse le reste dû (" + formatDZD(purchase.amount_due) + ").");
    if (!window.confirm("Enregistrer un paiement de " + formatDZD(amt) + " ? Il ne pourra plus être modifié.")) return;

    submitting.current = true;
    setBusy(true);
    const { error: err } = await supabase.rpc("record_purchase_payment", {
      p_company: company.id,
      p_purchase: purchase.id,
      p_amount: amt,
      p_date: payDate,
      p_method: method,
      p_notes: payNotes.trim() || null,
      p_key: payKey.current,
    });
    if (err) {
      setError(err.code === "P0001" ? err.message : "Enregistrement impossible. Réessayez.");
    } else {
      payKey.current = newKey();
      setAmount("");
      setPayNotes("");
      setInfo("Paiement enregistré.");
      await load();
    }
    setBusy(false);
    submitting.current = false;
  }

  async function onCancel(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !supabase || !company || !purchase) return;
    setError("");
    setInfo("");
    if (reason.trim() === "") return setError("Un motif est obligatoire.");
    if (!window.confirm("Annuler l'achat n° " + purchase.purchase_no + " ? Le stock reçu sera retiré. Cette action est définitive.")) return;

    submitting.current = true;
    setBusy(true);
    const { error: err } = await supabase.rpc("cancel_purchase", {
      p_company: company.id,
      p_purchase: purchase.id,
      p_reason: reason.trim(),
    });
    if (err) {
      setError(err.code === "P0001" ? err.message : "Annulation impossible. Réessayez.");
    } else {
      setShowCancel(false);
      setReason("");
      setInfo("Achat annulé. Le stock a été retiré.");
      await load();
    }
    setBusy(false);
    submitting.current = false;
  }

  if (!canView) {
    return (
      <section>
        <Link className="back-link" to="/stock">← Stock</Link>
        <h1>Achat</h1>
        <div className="card empty">
          <p className="muted">Les achats ne sont pas accessibles avec votre rôle.</p>
        </div>
      </section>
    );
  }
  if (loading && !purchase) {
    return (
      <section>
        <Link className="back-link" to="/stock/achats">← Achats</Link>
        <p className="muted">Chargement…</p>
      </section>
    );
  }
  if (notFound || !purchase) {
    return (
      <section>
        <Link className="back-link" to="/stock/achats">← Achats</Link>
        <h1>Achat introuvable</h1>
        {error && <p className="msg error">{error}</p>}
      </section>
    );
  }

  const cancelled = purchase.status === "cancelled";

  return (
    <section>
      <Link className="back-link" to="/stock/achats">← Achats</Link>
      <h1>Achat n° {purchase.purchase_no}</h1>
      {error && <p className="msg error">{error}</p>}
      {info && <p className="msg ok">{info}</p>}

      <div className="card">
        {cancelled ? (
          <span className="badge warn">Annulé</span>
        ) : (
          <span className={purchase.payment_status === "paid" ? "badge" : "badge warn"}>
            {payLabels[purchase.payment_status]}
          </span>
        )}
        <div className="muted">
          {frDate(purchase.purchase_date)}
          {supplierName ? " · " + supplierName : ""}
          {purchase.invoice_ref ? " · Facture " + purchase.invoice_ref : ""}
        </div>
        <div className="muted">
          Saisi le {formatDateTime(purchase.created_at)}
          {purchase.created_by ? " par " + (users[purchase.created_by] || "un ancien membre") : ""}
        </div>
        {purchase.notes && <div>{purchase.notes}</div>}
        {cancelled && (
          <p className="msg error">
            Annulé le {purchase.cancelled_at ? formatDateTime(purchase.cancelled_at) : ""}. Motif : {purchase.cancel_reason}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Lignes</h2>
        {items.map((it) => {
          const m = mats[it.material_id];
          const unit = m?.unit ?? "unit";
          return (
            <div className="row" key={it.id}>
              <div className="row-main">
                <strong>{m?.name ?? "Matière"}</strong>
                <div>
                  {it.quantity_input} {it.unit_input === "unit" ? "unité(s)" : it.unit_input} × {formatDZD(it.unit_price_input)} = {formatDZD(it.line_total)}
                </div>
                <div className="muted">
                  Reçu : {formatQty(it.quantity_base, unit)} · Coût réel : {formatCost(it.cost_per_base, unit)}
                </div>
                {it.supplier_lot && <div className="muted">Lot : {it.supplier_lot}</div>}
                {it.expiry_date && <div className="muted">Péremption : {frDate(it.expiry_date)}</div>}
              </div>
            </div>
          );
        })}
        <div className="sum-row"><span>Lignes</span><span>{formatDZD(purchase.s
