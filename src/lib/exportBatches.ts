import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadCsv, fetchAll, dateStamp } from "./csv";
import { formatDateTime } from "./format";

const frDate = (d: string) => d.split("-").reverse().join("/");

type B = {
  id: string; batch_no: number; recipe_id: string; version_id: string; perfume_id: string;
  produced_date: string; planned_volume_ml: number | string; theoretical_yield_ml: number | string;
  actual_volume_ml: number | string; volume_variance_ml: number | string;
  bulk_remaining_ml: number | string; total_cost: number | string; cost_per_ml: number | string;
  notes: string | null; created_by: string | null; created_at: string;
};

async function loadBatches(db: SupabaseClient, cid: string): Promise<B[]> {
  return fetchAll<B>((a, b) =>
    db.from("production_batches")
      .select("id, batch_no, recipe_id, version_id, perfume_id, produced_date, planned_volume_ml, theoretical_yield_ml, actual_volume_ml, volume_variance_ml, bulk_remaining_ml, total_cost, cost_per_ml, notes, created_by, created_at")
      .eq("company_id", cid).order("created_at").order("id").range(a, b)
  );
}

export async function exportBatches(db: SupabaseClient, cid: string): Promise<number> {
  const [rows, p, r, v] = await Promise.all([
    loadBatches(db, cid),
    db.from("perfumes").select("id, name").eq("company_id", cid),
    db.from("recipes").select("id, name").eq("company_id", cid),
    fetchAll<{ id: string; version_no: number }>((a, b) =>
      db.from("recipe_versions").select("id, version_no")
        .eq("company_id", cid).order("created_at").order("id").range(a, b)
    ),
  ]);
  const perfumes = new Map(((p.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const recipes = new Map(((r.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const versions = new Map(v.map((x) => [x.id, x.version_no]));
  const ids = Array.from(new Set(rows.map((x) => x.created_by).filter(Boolean))) as string[];
  const users = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
    ((data ?? []) as { id: string; full_name: string | null }[]).forEach((u) => users.set(u.id, u.full_name ?? ""));
  }
  downloadCsv(
    "lots_fabrication_" + dateStamp() + ".csv",
    ["N° lot", "Date", "Parfum", "Recette", "Version", "Volume à fabriquer (ml)", "Rendement théorique (ml)",
     "Volume obtenu (ml)", "Écart (ml)", "Reste en vrac (ml)", "Coût du lot (DA)", "Coût par ml (DA)",
     "Observations", "Utilisateur", "Saisi le"],
    rows.map((x) => [
      x.batch_no, frDate(x.produced_date), perfumes.get(x.perfume_id) ?? "", recipes.get(x.recipe_id) ?? "",
      versions.get(x.version_id) ?? "", Number(x.planned_volume_ml), Number(x.theoretical_yield_ml),
      Number(x.actual_volume_ml), Number(x.volume_variance_ml), Number(x.bulk_remaining_ml),
      Number(x.total_cost), Number(x.cost_per_ml), x.notes,
      x.created_by ? users.get(x.created_by) || "Ancien membre" : "Système", formatDateTime(x.created_at),
    ])
  );
  return rows.length;
}

export async function exportBatchConsumptions(db: SupabaseClient, cid: string): Promise<number> {
  type C = {
    batch_id: string; line_no: number; material_id: string; planned_qty_base: number | string;
    actual_qty_base: number | string; unit_cost: number | string; line_cost: number | string;
  };
  const [lines, batches] = await Promise.all([
    fetchAll<C>((a, b) =>
      db.from("production_consumptions")
        .select("batch_id, line_no, material_id, planned_qty_base, actual_qty_base, unit_cost, line_cost")
        .eq("company_id", cid).order("created_at").order("id").range(a, b)
    ),
    loadBatches(db, cid),
  ]);
  const { data: m } = await db.from("raw_materials").select("id, name, unit").eq("company_id", cid);
  const mats = new Map(((m ?? []) as { id: string; name: string; unit: string }[]).map((x) => [x.id, x]));
  const no = new Map(batches.map((x) => [x.id, x.batch_no]));
  downloadCsv(
    "lots_consommations_" + dateStamp() + ".csv",
    ["N° lot", "Ligne", "Matière", "Unité de stock", "Quantité prévue", "Quantité utilisée",
     "Coût unitaire (DA par unité de stock)", "Coût de la ligne (DA)"],
    lines.map((x) => [
      no.get(x.batch_id) ?? "", x.line_no, mats.get(x.material_id)?.name ?? "",
      mats.get(x.material_id)?.unit ?? "", Number(x.planned_qty_base), Number(x.actual_qty_base),
      Number(x.unit_cost), Number(x.line_cost),
    ])
  );
  return lines.length;
}
