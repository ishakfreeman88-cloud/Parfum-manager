import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatDZD } from "../lib/format";
import { fetchAll } from "../lib/csv";

type Row = { supplier_id: string | null; amount_due: number | string };
type Summary = { total: number; count: number; top: { name: string; due: number }[] };

export default function SupplierDebts() {
  const { company, role } = useCompany();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function run() {
      if (!supabase || !company || role === "seller") return;
      const db = supabase;
      try {
        const rows = await fetchAll<Row>((a, b) =>
          db.from("purchases")
            .select("supplier_id, amount_due")
            .eq("company_id", company.id)
            .eq("status", "received")
            .gt("amount_due", 0)
            .order("created_at").order("id").range(a, b)
        );
        const { data: sups } = await db.from("suppliers").select("id, name").eq("company_id", company.id);
        const nameOf: Record<string, string> = {};
        (sups ?? []).forEach((s: { id: string; name: string }) => { nameOf[s.id] = s.name; });

        const cents: Record<string, number> = {};
        let totalCents = 0;
        rows.forEach((r) => {
          const c = Math.round(Number(r.amount_due) * 100);
          const key = r.supplier_id ? nameOf[r.supplier_id] || "Fournisseur" : "Sans fournisseur";
          cents[key] = (cents[key] ?? 0) + c;
          totalCents += c;
        });
        const top = Object.entries(cents)
          .map(([name, c]) => ({ name, due: c / 100 }))
          .sort((x, y) => y.due - x.due)
          .slice(0, 5);
        setSummary({ total: totalCents / 100, count: rows.length, top });
      } catch {
        setError(true);
      }
    }
    run();
  }, [company, role]);

  if (role === "seller") return null;

  return (
    <div className="card">
      <h2>Dettes fournisseurs</h2>
      {error && <p className="muted">Calcul impossible pour le moment.</p>}
      {!error && summary === null && <p className="muted">Chargement…</p>}
      {summary && (
        <>
          {summary.count === 0 ? (
            <p className="muted">Aucun achat à payer.</p>
          ) : (
            <>
              <p>Reste à payer : <strong>{formatDZD(summary.total)}</strong></p>
              <p className="muted">{summary.count} achat(s) non soldé(s)</p>
              {summary.top.map((t) => (
                <div className="sum-row" key={t.name}>
                  <span>{t.name}</span>
                  <span>{formatDZD(t.due)}</span>
                </div>
              ))}
              <Link className="menu-link" to="/stock/achats">Voir les achats</Link>
            </>
          )}
          <p className="muted">
            Somme des restes dus sur les achats reçus. Ce n'est pas une sortie d'argent : elle ne change pas la trésorerie tant que rien n'est payé.
          </p>
        </>
      )}
    </div>
  );
}
