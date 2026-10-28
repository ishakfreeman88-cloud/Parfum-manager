import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatQty } from "../lib/units";
import { fetchAll } from "../lib/csv";

type Recipe = { id: string; name: string; perfume_id: string };
type Ver = {
  recipe_id: string;
  version_no: number;
  target_volume_ml: number | string;
  effective_date: string;
};

const frDate = (d: string) => d.split("-").reverse().join("/");

export default function Recipes() {
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [perfumes, setPerfumes] = useState<Record<string, string>>({});
  const [latest, setLatest] = useState<Record<string, Ver>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!supabase || !company || !allowed) return;
      const db = supabase;
      try {
        const [r, p, vers] = await Promise.all([
          db.from("recipes").select("id, name, perfume_id")
            .eq("company_id", company.id).eq("status", "active").order("name"),
          db.from("perfumes").select("id, name").eq("company_id", company.id),
          fetchAll<Ver>((a, b) =>
            db.from("recipe_versions")
              .select("recipe_id, version_no, target_volume_ml, effective_date")
              .eq("company_id", company.id)
              .order("created_at").order("id").range(a, b)
          ),
        ]);
        if (r.error || p.error) throw new Error("load");
        const names: Record<string, string> = {};
        (p.data ?? []).forEach((x: { id: string; name: string }) => { names[x.id] = x.name; });
        const last: Record<string, Ver> = {};
        const cnt: Record<string, number> = {};
        vers.forEach((v) => {
          cnt[v.recipe_id] = (cnt[v.recipe_id] ?? 0) + 1;
          if (!last[v.recipe_id] || v.version_no > last[v.recipe_id].version_no) last[v.recipe_id] = v;
        });
        setRecipes((r.data ?? []) as Recipe[]);
        setPerfumes(names);
        setLatest(last);
        setCounts(cnt);
      } catch {
        setError("Chargement impossible. Réessayez.");
      }
      setLoading(false);
    }
    load();
  }, [company, allowed]);

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/fabrication">← Fabrication</Link>
        <h1>Recettes</h1>
        <div className="card empty">
          <p className="muted">Les recettes sont réservées aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link className="back-link" to="/fabrication">← Fabrication</Link>
      <h1>Recettes</h1>
      {error && <p className="msg error">{error}</p>}
      <Link className="btn btn-link" to="/fabrication/recettes/nouveau">Nouvelle recette</Link>

      {loading && <p className="muted">Chargement…</p>}
      {!loading && recipes.length === 0 && !error && (
        <div className="card empty" style={{ marginTop: 12 }}>
          <p className="muted">Aucune recette enregistrée.</p>
        </div>
      )}

      {recipes.map((r) => {
        const v = latest[r.id];
        return (
          <div className="card" key={r.id} style={{ marginTop: 12 }}>
            <strong>{r.name}</strong>
            <div className="muted">Parfum : {perfumes[r.perfume_id] ?? "—"}</div>
            {v && (
              <div className="muted">
                Version {v.version_no} (sur {counts[r.id]}) · volume cible {formatQty(Number(v.target_volume_ml), "ml")} · en vigueur depuis le {frDate(v.effective_date)}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Link className="btn-small" to={"/fabrication/recettes/" + r.id + "/version"}>
                Nouvelle version
              </Link>
            </div>
          </div>
        );
      })}
    </section>
  );
}
