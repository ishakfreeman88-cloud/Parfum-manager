export const movementLabels: Record<string, string> = {
  opening: "Stock d'ouverture",
  purchase: "Achat",
  production_use: "Consommation en fabrication",
  adjustment: "Correction",
  loss: "Perte",
  supplier_return: "Retour fournisseur",
};

// Types qu'on peut saisir à la main (les achats et la fabrication auront leurs propres écrans).
export const manualTypes = ["opening", "adjustment", "loss", "supplier_return"];

// Unités de saisie proposées selon l'unité de stock. Le serveur refait la conversion.
export const inputUnits: Record<string, { code: string; label: string; factor: number }[]> = {
  ml: [
    { code: "ml", label: "millilitre (ml)", factor: 1 },
    { code: "l", label: "litre (L)", factor: 1000 },
  ],
  g: [
    { code: "g", label: "gramme (g)", factor: 1 },
    { code: "kg", label: "kilogramme (kg)", factor: 1000 },
  ],
  unit: [{ code: "unit", label: "unité", factor: 1 }],
};

// Clé unique par saisie : un double envoi ne crée jamais deux mouvements.
export function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return "mv-" + crypto.randomUUID();
  return "mv-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function parseNumber(v: string): number {
  return Number(v.trim().replace(",", "."));
}
