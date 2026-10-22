export const materialTypes: Record<string, string> = {
  extract: "Extrait de parfum",
  alcohol: "Alcool",
  fixative: "Fixateur",
  bottle: "Flacon",
  cap: "Bouchon / vaporisateur",
  label: "Étiquette",
  box: "Boîte / emballage",
  consumable: "Consommable",
  other: "Autre",
};

// Unités de base : le stock est toujours conservé en ml, g ou unité.
export const baseUnits: Record<string, string> = {
  ml: "Millilitre (ml)",
  g: "Gramme (g)",
  unit: "Unité",
};

export function unitSymbol(unit: string): string {
  return unit === "unit" ? "unité(s)" : unit;
}

export function formatQty(qty: number, unit: string): string {
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(qty);
  return n + " " + unitSymbol(unit);
}

// Coût par unité de base (jusqu'à 4 décimales : un coût au ml est souvent très petit).
export function formatCost(cost: number, unit: string): string {
  const n = new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
  return n + " / " + unitSymbol(unit);
}
