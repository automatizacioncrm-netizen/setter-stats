export type DateRange = { startDate: string; endDate: string };
export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "custom"
  | `month:${number}`
  | `month:${number}:${number}`;
const DAY = 86400000;
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateRange(range: DateRange): string {
  if (!range.startDate || !range.endDate) return "Selecciona la fecha inicial y la fecha final.";
  if (!validDate(range.startDate) || !validDate(range.endDate))
    return "Las fechas deben ser reales y válidas (YYYY-MM-DD).";
  if (range.startDate > range.endDate)
    return "La fecha inicial no puede ser posterior a la fecha final.";
  if ((Date.parse(range.endDate) - Date.parse(range.startDate)) / DAY + 1 > 366)
    return "El rango no puede superar 366 días, incluidos inicio y fin.";
  return "";
}
function calendar(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function shift(day: string, offset: number) {
  return calendar(new Date(Date.parse(day + "T12:00:00Z") + offset * DAY));
}
export function limaDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function today(now = new Date()): DateRange {
  const day = limaDay(now);
  return { startDate: day, endDate: day };
}
export function yesterday(now = new Date()): DateRange {
  const day = shift(limaDay(now), -1);
  return { startDate: day, endDate: day };
}
export function thisWeek(now = new Date()): DateRange {
  const day = limaDay(now);
  const offset = (new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7;
  const startDate = shift(day, -offset);
  return { startDate, endDate: shift(startDate, 6) };
}
export function lastWeek(now = new Date()): DateRange {
  const range = thisWeek(now);
  return { startDate: shift(range.startDate, -7), endDate: shift(range.endDate, -7) };
}
export function monthOfYear(year: number, month: number): DateRange {
  return {
    startDate: calendar(new Date(Date.UTC(year, month - 1, 1))),
    endDate: calendar(new Date(Date.UTC(year, month, 0))),
  };
}
export function thisMonth(now = new Date()): DateRange {
  const day = limaDay(now);
  return monthOfYear(Number(day.slice(0, 4)), Number(day.slice(5, 7)));
}
export function lastMonth(now = new Date()): DateRange {
  const day = limaDay(now),
    date = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 2, 1));
  return monthOfYear(date.getUTCFullYear(), date.getUTCMonth() + 1);
}
export function customRange(startDate: string, endDate: string): DateRange {
  const range = { startDate, endDate };
  const error = validateRange(range);
  if (error) throw new Error(error);
  return range;
}
export function rangeForPreset(
  preset: DatePreset,
  custom?: DateRange,
  now = new Date(),
): DateRange | undefined {
  switch (preset) {
    case "all":
      return undefined;
    case "today":
      return today(now);
    case "yesterday":
      return yesterday(now);
    case "thisWeek":
      return thisWeek(now);
    case "lastWeek":
      return lastWeek(now);
    case "thisMonth":
      return thisMonth(now);
    case "lastMonth":
      return lastMonth(now);
    case "custom":
      if (!custom) throw new Error("Aplica un rango personalizado.");
      return customRange(custom.startDate, custom.endDate);
    default: {
      const [, monthValue, yearValue = limaDay(now).slice(0, 4)] = preset.split(":");
      const month = Number(monthValue);
      if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Mes inválido.");
      return monthOfYear(Number(yearValue), month);
    }
  }
}
const MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];
export function rangeLabel(range?: DateRange): string {
  if (!range) return "Todo el histórico";
  const [y, m, d] = range.startDate.split("-").map(Number),
    [ey, em, ed] = range.endDate.split("-").map(Number);
  if (!m || !em) return "Período seleccionado";
  const month = MONTHS[m - 1],
    endMonth = MONTHS[em - 1];
  if (
    range.startDate === `${y}-${String(m).padStart(2, "0")}-01` &&
    range.endDate === monthOfYear(y!, m).endDate
  )
    return `${month} ${y}`;
  if (range.startDate === range.endDate) return `${d} DE ${month} DE ${y}`;
  if (y === ey && m === em) return `${d} AL ${ed} DE ${month} DE ${y}`;
  return `${d} DE ${month} DE ${y} AL ${ed} DE ${endMonth} DE ${ey}`;
}
export function rangePeriod(value: unknown): DateRange | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})\s*\/\s*(\d{4}-\d{2}-\d{2})$/);
  if (!match) return undefined;
  const range = { startDate: match[1]!, endDate: match[2]! };
  return validateRange(range) ? undefined : range;
}
