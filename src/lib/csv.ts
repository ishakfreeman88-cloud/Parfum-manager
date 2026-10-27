export type Cell = string | number | null | undefined;

// Séparateur ";" et virgule décimale : s'ouvre correctement dans Excel en français.
function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  let s = v;
  // Protection contre l'injection de formule dans Excel (=, +, -, @)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(cell).join(";"));
  return "\uFEFF" + lines.join("\r\n"); // BOM : les accents s'affichent bien
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lit TOUTES les lignes, par pages de 1000 (limite par défaut de l'API).
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error("Lecture impossible");
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

// Date du jour à Alger, au format AAAA-MM-JJ
export function dateStamp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
}
