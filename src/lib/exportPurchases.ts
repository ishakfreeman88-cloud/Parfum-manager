import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadCsv, fetchAll, dateStamp } from "./csv";
import { formatDateTime } from "./format";

const frDate = (d: string) => d.split("-").reverse().join("/");
const statusOf = (s: string) => (s === "cancelled" ? "Annulé" : "Reçu");
const payOf = (s: string) => (s === "paid" ? "Payé" : s === "partial" ? "Partiel" : "Non payé");

type P = {
  id: string; purchase_no: number; supplier_id: string | null; purchase_date: string;
  invoice_ref: string | null; subtotal: number | string; discount: number | string;
  extra_fees: number | string; total: number | string; amount_paid: number | string;
  amount_due: number | string; payment_status: string; status: string;
  cancel_reason: string | null; notes: string | null; created_at: string;
};
type S = { id: string; name: string };

async function loadSuppliers(db: SupabaseClient, cid: string): Promise<Map<string, string>> {
  const { data } = await db.from("suppliers").select("id, name").eq("company_id", cid);
  return new Map(((data ?? []) as S[]).map((s) => [s.id, s.name]));
}
async function loadPurchases(db: SupabaseClient, cid: string): Promise<P[]> {
  return fetchAll<P>((a, b) =>
    db.from("purchases")
      .select("id, purchase_no, supplier_id, purchase_date, invoice_ref, subtotal, discount, extra_fees, total, amount_paid, amount_due, payment_status, status, cancel_reason, notes, created_at")
      .eq("company_id", cid).order("created_at").order("id").range(a, b)
  );
}

export async function exportPurchases(db: SupabaseClient, cid: string): Promise<number> {
  const [rows, sup] = await Promise.all([loadPurchases(db, cid), loadSuppliers(db, cid)]);
  downloadCsv(
    "achats_" + dateStamp() + ".csv",
    ["N° achat", "Date", "Fournisseur", "Facture", "Lignes (DA)", "Remise (DA)", "Frais (DA)",
     "Total (DA)", "Payé (DA)", "Reste dû (DA)", "Paiement", "Statut", "Motif d'annulation", "Notes", "Saisi le"],
    rows.map((p) => [
      p.purchase_no, frDate(p.purchase_date), p.supplier_id ? sup.get(p.supplier_id) ?? "" : "",
      p.invoice_ref, Number(p.subtotal), Number(p.discount), Number(p.extra_fees), Number(p.total),
      Number(p.amount_paid), Number(p.amount_due), payOf(p.payment_status), statusOf(p.status),
      p.cancel_reason, p.notes, formatDateTime(p.created_at),
    ])
  );
  return rows.length;
}

export async function exportPurchaseLines(db: SupabaseClient, cid: string): Promise<number> {
  type L = {
    purchase_id: string; line_no: number; material_id: string; quantity_input: number | string;
    unit_input: string; quantity_base: number | string; unit_price_input: number | string;
    line_total: number | string; landed_total: number | string; cost_per_base: number | string;
    supplier_lot: string | null; expiry_date: string | null;
  };
  const [lines, purchases] = await Promise.all([
    fetchAll<L>((a, b) =>
      db.from("purchase_items")
        .select("purchase_id, line_no, material_id, quantity_input, unit_input, quantity_base, unit_price_input, line_total, landed_total, cost_per_base, supplier_lot, expiry_date")
        .eq("company_id", cid).order("created_at").order("id").range(a, b)
    ),
    loadPurchases(db, cid),
  ]);
  const { data: m } = await db.from("raw_materials").select("id, name, unit").eq("company_id", cid);
  const mats = new Map(((m ?? []) as { id: string; name: string; unit: string }[]).map((x) => [x.id, x]));
  const no = new Map(purchases.map((p) => [p.id, p.purchase_no]));
  downloadCsv(
    "achats_lignes_" + dateStamp() + ".csv",
    ["N° achat", "Ligne", "Matière", "Quantité achetée", "Unité d'achat", "Quantité en stock",
     "Unité de stock", "Prix unitaire (DA)", "Montant ligne (DA)", "Coût réel avec frais et remise (DA)",
     "Coût par unité de stock (DA)", "Lot fournisseur", "Péremption"],
    lines.map((l) => [
      no.get(l.purchase_id) ?? "", l.line_no, mats.get(l.material_id)?.name ?? "",
      Number(l.quantity_input), l.unit_input, Number(l.quantity_base), mats.get(l.material_id)?.unit ?? "",
      Number(l.unit_price_input), Number(l.line_total), Number(l.landed_total), Number(l.cost_per_base),
      l.supplier_lot, l.expiry_date ? frDate(l.expiry_date) : "",
    ])
  );
  return lines.length;
}

export async function exportPurchasePayments(db: SupabaseClient, cid: string): Promise<number> {
  type Y = {
    purchase_id: string; amount: number | string; paid_at: string; method: string;
    notes: string | null; created_by: string | null; created_at: string;
  };
  const [pays, purchases] = await Promise.all([
    fetchAll<Y>((a, b) =>
      db.from("purchase_payments")
        .select("purchase_id, amount, paid_at, method, notes, created_by, created_at")
        .eq("company_id", cid).order("created_at").order("id").range(a, b)
    ),
    loadPurchases(db, cid),
  ]);
  const ids = Array.from(new Set(pays.map((p) => p.created_by).filter(Boolean))) as string[];
  const users = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
    ((data ?? []) as { id: string; full_name: string | null }[]).forEach((u) => users.set(u.id, u.full_name ?? ""));
  }
  const no = new Map(purchases.map((p) => [p.id, p.purchase_no]));
  downloadCsv(
    "paiements_fournisseurs_" + dateStamp() + ".csv",
    ["N° achat", "Date du paiement", "Montant (DA)", "Mode", "Notes", "Utilisateur", "Saisi le"],
    pays.map((p) => [
      no.get(p.purchase_id) ?? "", frDate(p.paid_at), Number(p.amount), p.method, p.notes,
      p.created_by ? users.get(p.created_by) || "Ancien membre" : "Système", formatDateTime(p.created_at),
    ])
  );
  return pays.length;
}
