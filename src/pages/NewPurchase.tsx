import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatCost } from "../lib/units";
import { formatDZD } from "../lib/format";
import { inputUnits, newKey, parseNumber } from "../lib/movements";
import { dateStamp } from "../lib/csv";

type Mat = { id: string; name: string; unit: string };
type Sup = { id: string; name: string };
type Line = {
  uid: string;
  materialId: string;
  qty: string;
  unit: string;
  price: string;
  lot: string;
  expiry: string;
};

const methods = ["Espèces", "Virement", "Chèque", "Paiement électronique", "Autre"];
const MAX_LINES = 30;

function emptyLine(): Line {
  return { uid: newKey(), materialId: "", qty: "", unit: "", price: "", lot: "", expiry: "" };
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const num0 = (v: string) => (v.trim() === "" ? 0 : parseNumber(v));

export default function NewPurchase() {
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";
  const navigate = useNavigate();

  const [mats, setMats] = useState<Mat[]>([]);
  const [sups, setSups] = useState<Sup[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(dateStamp());
  const [invoice, setInvoice] = useState("");
  const [discount, setDiscount] = useState("");
  const [fees, setFees] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState(methods[0]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(newKey()); // une clé par saisie : un double envoi ne crée qu'un achat
  const submitting = useRef(false);

  useEffect(() => {
    async function load() {
      if (!supabase || !company) return;
      const [m, s] = await Promise.all([
        supabase.from("raw_materials").select("id, name, unit")
          .eq("company_id", company.id).eq("status", "active").order("name"),
        supabase.from("suppliers").select("id, name")
          .eq("company_id", company.id).eq("status", "active").order("name"),
      ]);
      setMats((m.data ?? []) as Mat[]);
      setSups((s.data ?? []) as Sup[]);
    }
    load();
  }, [company]);

  function updateLine(uid: string, patch: Partial<Line>) {
    setLines((old) => old.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }
  function pickMaterial(uid: string, id: string) {
    const m = mats.find((x) => x.id === id);
    updateLine(uid, { materialId: id, unit: m ? m.unit : "" });
  }

  const calc = useMemo(() => {
    const rows = lines.map((l) => {
      const mat = mats.find((m) => m.id === l.materialId);
      const q = parseNumber(l.qty);
      const p = parseNumber(l.price);
      const info = mat ? inputUnits[mat.unit]?.find((u) => u.code === l.unit) : undefined;
      const valid =
        Boolean(mat && info) &&
        l.qty.trim() !== "" && Number.isFinite(q) && q > 0 &&
        l.price.trim() !== "" && Number.isFinite(p) && p >= 0;
      return { mat, q, p, info, valid, total: valid ? r2(q * p) : 0 };
    });
    const subtotal = r2(rows.reduce((s, r) => s + r.total, 0));
    return { rows, subtotal };
  }, [lines, mats]);

  const disc = num0(discount);
  const fee = num0(fees);
  const paidNum = num0(paid);
  const total = r2(calc.subtotal - (Number.isFinite(disc) ? disc : 0) + (Number.isFinite(fee) ? fee : 0));
  const due = r2(total - (Number.isFinite(paidNum) ? paidNum : 0));

  function validate(): string {
    if (lines.length === 0) return "Ajoutez au moins une ligne.";
    for (let i = 0; i < calc.rows.length; i++) {
      if (!calc.rows[i].valid) return "Ligne " + (i + 1) + " : matière, quantité et prix sont obligatoires.";
    }
    if (calc.subtotal <= 0) return "Le montant des lignes doit être supérieur à zéro.";
    if (!Number.isFinite(disc) || disc < 0) return "Remise invalide.";
    if (!Number.isFinite(fee) || fee < 0) return "Frais invalides.";
    if (disc > calc.subtotal) return "La remise dépasse le montant des lignes.";
    if (!Number.isFinite(paidNum) || paidNum < 0) return "Montant payé invalide.";
    if (paidNum > total) return "Le montant payé dépasse le total.";
    return "";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !supabase || !company) return;
    setError("");
    const problem = validate();
    if (problem) return setError(problem);
    if (!window.confirm("Enregistrer cet achat de " + formatDZD(total) + " ? Le stock sera augmenté immédiatement.")) return;

    submitting.current = true;
    setBusy(true);
    const { error: err } = await supabase.rpc("create_purchase", {
      p_company: company.id,
      p_supplier: supplierId || null,
      p_date: date,
      p_invoice: invoice.trim() || null,
      p_discount: disc,
      p_fees: fee,
      p_paid: paidNum,
      p_method: paidNum > 0 ? method : null,
      p_notes: notes.trim() || null,
      p_key: keyRef.current,
      p_items: lines.map((l) => ({
        material_id: l.materialId,
        quantity: parseNumber(l.qty),
        unit: l.unit,
        unit_price: parseNumber(l.price),
        lot: l.lot.trim() || null,
        expiry: l.expiry || null,
      })),
    });
    setBusy(false);
    submitting.current = false;
    if (err) {
      setError(err.code === "P0001" ? err.message : "Enregistrement impossible. Réessayez.");
      return;
    }
    keyRef.current = newKey();
    navigate("/stock/achats", { replace: true });
  }

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/stock/achats">← Achats</Link>
        <h1>Nouvel achat</h1>
        <div className="card empty">
          <p className="muted">Réservé aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link className="back-link" to="/stock/achats">← Achats</Link>
      <h1>Nouvel achat</h1>
      {error && <p className="msg error">{error}</p>}

      <form onSubmit={onSubmit}>
        <div className="card">
          <label className="field">
            <span>Fournisseur</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Aucun</option>
              {sups.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date de l'achat</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Numéro de facture (facultatif)</span>
            <input value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          </label>
        </div>

        {lines.map((l, i) => {
          const row = calc.rows[i];
          const units = row.mat ? inputUnits[row.mat.unit] : [];
          let landed = "";
          if (row.valid && row.info && row.mat && calc.subtotal > 0) {
            const net = row.total + ((Number.isFinite(fee) ? fee : 0) - (Number.isFinite(disc) ? disc : 0)) * row.total / calc.subtotal;
            landed = formatCost(net / (row.q * row.info.factor), row.mat.unit);
          }
          return (
            <div className="card" key={l.uid}>
              <div className="row" style={{ borderTop: 0, padding: 0 }}>
                <h2 style={{ margin: 0 }}>Ligne {i + 1}</h2>
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
                    <span>Quantité</span>
                    <input value={l.qty} inputMode="decimal" onChange={(e) => updateLine(l.uid, { qty: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Unité d'achat</span>
                    <select value={l.unit} onChange={(e) => updateLine(l.uid, { unit: e.target.value })}>
                      {units.map((u) => (
                        <option key={u.code} value={u.code}>{u.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Prix unitaire en DA, par {l.unit === "unit" ? "unité" : l.unit}</span>
                    <input value={l.price} inputMode="decimal" onChange={(e) => updateLine(l.uid, { price: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Numéro de lot fournisseur (facultatif)</span>
                    <input value={l.lot} onChange={(e) => updateLine(l.uid, { lot: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Date de péremption (facultatif)</span>
                    <input type="date" value={l.expiry} onChange={(e) => updateLine(l.uid, { expiry: e.target.value })} />
                  </label>
                  {row.valid && (
                    <>
                      <p>Montant de la ligne : <strong>{formatDZD(row.total)}</strong></p>
                      {landed && <p className="muted">Coût réel après remise et frais : {landed}</p>}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}

        {lines.length < MAX_LINES && (
          <button type="button" className="btn-small" onClick={() => setLines((old) => [...old, emptyLine()])}>
            + Ajouter une ligne
          </button>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Remise globale en DA (facultatif)</span>
            <input value={discount} inputMode="decimal" onChange={(e) => setDiscount(e.target.value)} />
          </label>
          <label className="field">
            <span>Frais supplémentaires en DA (transport, douane…)</span>
            <input value={fees} inputMode="decimal" onChange={(e) => setFees(e.target.value)} />
          </label>
          <label className="field">
            <span>Montant payé maintenant en DA</span>
            <input value={paid} inputMode="decimal" onChange={(e) => setPaid(e.target.value)} />
          </label>
          {paidNum > 0 && (
            <label className="field">
              <span>Mode de paiement</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {methods.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="sum-row"><span>Lignes</span><span>{formatDZD(calc.subtotal)}</span></div>
          <div className="sum-row"><span>Remise</span><span>− {formatDZD(Number.isFinite(disc) ? disc : 0)}</span></div>
          <div className="sum-row"><span>Frais</span><span>+ {formatDZD(Number.isFinite(fee) ? fee : 0)}</span></div>
          <div className="sum-row total"><span>Total</span><span>{formatDZD(total)}</span></div>
          <div className="sum-row"><span>Reste dû</span><span>{formatDZD(due)}</span></div>
          <p className="muted">Ces montants sont un aperçu : le serveur recalcule tout à l'enregistrement.</p>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Veuillez patienter…" : "Enregistrer l'achat"}
          </button>
        </div>
      </form>
    </section>
  );
}
