import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCompany } from "../company/CompanyContext";
import { formatDZD } from "../lib/format";
import { formatQty } from "../lib/units";
import { parseNumber } from "../lib/movements";

type Recipe = { id: string; name: string; perfume_id: string; status: "active" | "archived" };
type Version = {
  id: string;
  version_no: number;
  target_volume_ml: number;
  expected_yield_ml: number;
  instructions: string | null;
  notes: string | null;
  effective_date: string;
  created_at: string;
};
type Ingredient = {
  id: string;
  line_no: number;
  material_id: string;
  quantity_input: number;
  unit_input: string;
  quantity_base: number;
};
type Mat = {
  id: string;
  name: string;
  unit: string;
  quantity_on_hand: number;
  avg_cost: number;
  status: string;
};

const frDate = (d: string) => d.split("-").reverse().join("/");

export default function RecipeDetail() {
  const { id } = useParams();
  const { company, role } = useCompany();
  const allowed = role === "admin" || role === "manager";

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [perfumeName, setPerfumeName] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [mats, setMats] = useState<Record<string, Mat>>({});
  const [want, setWant] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !company || !id || !allowed) return;
    const db = supabase;
    const { data: r, error: e1 } = await db
      .from("recipes")
      .select("id, name, perfume_id, status")
      .eq("id", id)
      .eq("company_id", company.id)
      .maybeSingle();
    if (e1) {
      setError("Chargement impossible. Réessayez.");
      setLoading(false);
      return;
    }
    if (!r) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setRecipe(r as Recipe);
    const [p, v] = await Promise.all([
      db.from("perfumes").select("name").eq("id", r.perfume_id).maybeSingle(),
      db
        .from("recipe_versions")
        .select("id, version_no, target_volume_ml, expected_yield_ml, instructions, notes, effective_date, created_at")
        .eq("recipe_id", id)
        .eq("company_id", company.id)
        .order("version_no", { ascending: false }),
    ]);
    if (v.error) {
      setError("Chargement impossible. Réessayez.");
      setLoading(false);
      return;
    }
    setPerfumeName(p.data?.name ?? "");
    const list: Version[] = (v.data ?? []).map((x: Version) => ({
      ...x,
      target_volume_ml: Number(x.target_volume_ml),
      expected_yield_ml: Number(x.expected_yield_ml),
    }));
    setVersions(list);
    setSelected((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0]?.id ?? ""));
    setLoading(false);
  }, [company, id, allowed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    async function run() {
      if (!supabase || !company || !selected) {
        setIngredients([]);
        return;
      }
      const db = supabase;
      const { data, error: err } = await db
        .from("recipe_ingredients")
        .select("id, line_no, material_id, quantity_input, unit_input, quantity_base")
        .eq("version_id", selected)
        .eq("company_id", company.id)
        .order("line_no");
      if (err) {
        setError("Chargement impossible. Réessayez.");
        return;
      }
      const list: Ingredient[] = (data ?? []).map((x: Ingredient) => ({
        ...x,
        quantity_input: Number(x.quantity_input),
        quantity_base: Number(x.quantity_base),
      }));
      setIngredients(list);
      const ids = Array.from(new Set(list.map((x) => x.material_id)));
      if (ids.length > 0) {
        const { data: m } = await db
          .from("raw_materials")
          .select("id, name, unit, quantity_on_hand, avg_cost, status")
          .in("id", ids);
        const map: Record<string, Mat> = {};
        (m ?? []).forEach((x: Mat) => {
          map[x.id] = { ...x, quantity_on_hand: Number(x.quantity_on_hand), avg_cost: Number(x.avg_cost) };
        });
        setMats(map);
      }
    }
    run();
  }, [company, selected]);

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (busy || !supabase || !company || !recipe) return;
    setError("");
    setInfo("");
    const n = newName.trim();
    if (n.length < 2 || n.length > 120) {
      setError("Le nom doit contenir entre 2 et 120 caractères.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase
      .from("recipes")
      .update({ name: n })
      .eq("id", recipe.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (err) {
      setError("Renommage impossible. Réessayez.");
      return;
    }
    setRenaming(false);
    setInfo("Recette renommée.");
    await load();
  }

  async function setStatus(status: "active" | "archived") {
    if (busy || !supabase || !company || !recipe) return;
    setBusy(true);
    setError("");
    setInfo("");
    const { error: err } = await supabase
      .from("recipes")
      .update({ status })
      .eq("id", recipe.id)
      .eq("company_id", company.id);
    setBusy(false);
    if (err) {
      setError("Action impossible. Réessayez.");
      return;
    }
    setInfo(status === "archived" ? "Recette archivée." : "Recette restaurée.");
    await load();
  }

  if (!allowed) {
    return (
      <section>
        <Link className="back-link" to="/fabrication/recettes">← Recettes</Link>
        <h1>Recette</h1>
        <div className="card empty">
          <p className="muted">Les recettes sont réservées aux administrateurs et gestionnaires.</p>
        </div>
      </section>
    );
  }
  if (loading) return <p className="muted">Chargement…</p>;
  if (notFound || !recipe) {
    return (
      <section>
        <Link className="back-link" to="/fabrication/recettes">← Recettes</Link>
        <h1>Recette introuvable</h1>
        {error && <p className="msg error">{error}</p>}
      </section>
    );
  }

  const version = versions.find((v) => v.id === selected);
  const isCurrent = versions.length > 0 && versions[0].id === selected;
  const target = version?.target_volume_ml ?? 0;
  const wantNum = want.trim() === "" ? target : parseNumber(want);
  const validWant = target > 0 && Number.isFinite(wantNum) && wantNum > 0 && wantNum <= 1000000;
  const factor = validWant ? wantNum / target : 0;

  const calc = ingredients.map((i) => {
    const mat = mats[i.material_id];
