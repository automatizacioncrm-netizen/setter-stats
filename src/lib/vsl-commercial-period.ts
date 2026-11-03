import { limaDay } from "./vsl-date-range";
export type CommercialPeriod = { year: string; start: string; end: string };
export function initialCommercialPeriod(today = limaDay()): CommercialPeriod {
  return { year: "2026", start: "7", end: String(Number(today.slice(5, 7))) };
}
export function historicalCommercialMonths(today = limaDay()): string[] {
  const result: string[] = [];
  for (
    let year = 2026, month = 7;
    `${year}-${String(month).padStart(2, "0")}` <= today.slice(0, 7);
  ) {
    result.unshift(`${year}-${String(month).padStart(2, "0")}`);
    if (month === 12) {
      year++;
      month = 1;
    } else month++;
  }
  return result;
}
export function selectedCommercialMonths(period: CommercialPeriod, today = limaDay()): string[] {
  if (
    !/^\d{4}$/.test(period.year) ||
    Number(period.year) < 2000 ||
    !/^(?:[1-9]|1[0-2])$/.test(period.start) ||
    !/^(?:[1-9]|1[0-2])$/.test(period.end) ||
    Number(period.start) > Number(period.end)
  )
    throw new Error("Selecciona un año válido y meses en orden.");
  const last = `${period.year}-${period.end.padStart(2, "0")}`;
  if (last > today.slice(0, 7)) throw new Error("No se permiten períodos futuros.");
  return Array.from(
    { length: Number(period.end) - Number(period.start) + 1 },
    (_, i) => `${period.year}-${String(Number(period.end) - i).padStart(2, "0")}`,
  );
}
