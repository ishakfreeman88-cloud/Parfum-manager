export const TIMEZONE = "Africa/Algiers";

// Montants en dinar algérien. Les calculs financiers se feront côté base de données.
export function formatDZD(amount: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
