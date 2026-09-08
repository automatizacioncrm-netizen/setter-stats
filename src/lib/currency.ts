/** Missing/invalid currency must not silently turn into USD or PEN. */
export function formatCurrency(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(code === "PEN" ? "es-PE" : "en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return "—";
  }
}
