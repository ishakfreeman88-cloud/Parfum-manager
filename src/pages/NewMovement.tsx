import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatQty } from "../lib/units";
import { movementLabels, manualTypes, inputUnits, newKey, parseNumber } from "../lib/movements";

type Mat = { id: string; name: string; unit: string; quantity_on_hand: number };

export default function NewMovement() {
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";
  const [params] = useSearchParams();

  const [mats, setMats] = useState<Mat[]>([]);
  const [materialId, setMaterialId] = useState(params.get("matiere") ?? "");
  const [type, setType] = useState("opening");
  const [qty, setQty] = useState("");
  const [unitCode, setUnitCode] = useState("ml");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const keyRef = useRef(newKey());
  const submitting = useRef(false);

  const load = useCallback(async () => {
    if (!supabase || !company) return;
    const { data } = await supabase
      .from("raw_materials")
      .select("id, name, unit, quantity_on_hand")
      .eq("company_id", company.id)
      .eq("status", "active")
      .order("name");
    setMats(
      (data ?? []).map((r: Mat) => ({ ...r, quantity_on_hand: Number(r.quantity_on_hand) }))
    );
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  const mat = mats.find((m) => m.id === materialId);

  useEffect(() => {
    if (mat) setUnitCode(mat.unit);
  }, [mat?.id]); // eslint-disable-line

  const units = mat ? inputUnits[mat.unit] : [];
  const unitInfo = units.find((u) => u.code === unitCode);
  const needsReason = type !== "opening";
  const showCost = type === "opening" || type === "adjustment";
  const qtyNum = parseNumber(qty);
  const qtyOk = qty.trim() !== "" && Number.isFinite(qtyNum) && qtyNum !== 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !supabase || !company || !mat || !unitInfo) return;
    setError("");
    setDone("");

    if (!qtyOk) return setError("Saisissez une quantité valide.");
    if (type !== "adjustment" && qtyNum < 0) return setError("La quantité doit être positive.");
    if (needsReason && reason.trim() === "") return setError("Un motif est obligatoire.");

    let costNum: number | null = null;
    if (showCost && cost.trim() !== "") {
      costNum = parseNumber(cost);
      if (!Number.isFinite(costNum) || costNum < 0) return setError("Le coût doit être un nombre positif ou nul.");
    }
    if (type === "opening" && costNum === null) return setError("Le coût unitaire est obligatoire pour un stock d'ouverture.");

    const label = movementLabels[type];
    if (!window.confirm(`Enregistrer : ${label}, ${qtyNum} ${unitInfo.code} de « ${mat.name} » ? Un mouvement ne peut plus être modifié, seulement corrigé.`)) return;

    submitting.current = true;
    setBusy(true);
    const { error: err } = await supabase.rpc("record_stock_movement", {
      p_company: company.id,
      p_material: mat.id,
      p_type: type,
      p_quantity: qtyNum,
      p_unit: unitInfo.code,
      p_unit_cost: costNum,
      p_reason: reason.trim() || null,
      p_notes: notes.trim() || null,
      p_key: keyRef.current,
    });
    if (err) {
      setError(err.code === "P0001" ? err.message : "Enregistrement impossible. Réessayez.");
    } else {
      setDone("Mouvement enregistré.");
      keyRef.current = newKey();
      setQty("");
      setCost("");
      setReason("");
      setNotes("");
      await load();
    }
    setBusy(false);
    submitting.current = false;
  }

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/stock">← Stock</Link>
        <h1>Nouveau mouvement</h1>
        <div className="card empty">
          <p className="muted">Réservé aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link className="back-link" to="/stock">← Stock</Link>
      <h1>Nouveau mouvement</h1>
      {error && <p className="msg error">{error}</p>}
      {done && <p className="msg ok">{done}</p>}

      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>Matière</span>
          <select value={materialId} onChange={(e) => { setMaterialId(e.target.value); setDone(""); }}>
            <option value="">Choisir…</option>
            {mats.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        {mat && (
          <p className="muted">Stock actuel : <strong>{formatQty(mat.quantity_on_hand, mat.unit)}</strong></p>
        )}

        <label className="field">
          <span>Type de mouvement</span>
          <select value={type} onChange={(e) => { setType(e.target.value); setError(""); }}>
            {manualTypes.map((t) => (
              <option key={t} value={t}>{movementLabels[t]}</option>
            ))}
          </select>
        </label>
        {type === "adjustment" && (
          <p className="muted">Correction : saisissez une quantité positive (ajout) ou négative (retrait), par exemple -200.</p>
        )}

        {mat && (
          <>
            <label className="field">
              <span>Quantité</span>
              <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
            </label>
            <label className="field">
              <span>Unité de saisie</span>
              <select value={unitCode} onChange={(e) => setUnitCode(e.target.value)}>
                {units.map((u) => (
                  <option key={u.code} value={u.code}>{u.label}</option>
                ))}
              </select>
            </label>
            {qtyOk && unitInfo && (
              <p className="muted">Soit {formatQty(qtyNum * unitInfo.factor, mat.unit)} en stock.</p>
            )}
          </>
        )}

        {mat && showCost && unitInfo && (
          <label className="field">
            <span>
              Coût unitaire en DA par {unitInfo.code === "unit" ? "unité" : unitInfo.code}
              {type === "adjustment" ? " (facultatif, pour un ajout)" : ""}
            </span>
            <input value={cost} inputMode="decimal" onChange={(e) => setCost(e.target.value)} />
          </label>
        )}

        <label className="field">
          <span>Motif{needsReason ? "" : " (facultatif)"}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <button className="btn" type="submit" disabled={busy || !mat}>
          {busy ? "Veuillez patienter…" : "Enregistrer"}
        </button>
      </form>
    </section>
  );
}
