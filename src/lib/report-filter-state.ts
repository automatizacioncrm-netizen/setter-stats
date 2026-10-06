import type { DatePreset, ReportFilters } from "../types/reports";

export const REPORT_CLOSERS = [
  "Fiorela Bernales",
  "Ezequiel Dario",
  "Amaranta Alfonso Krasnova",
] as const;

export const isReportCloser = (name: string) => REPORT_CLOSERS.some((closer) => closer === name);

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  preset: "todos",
  pipeline: "all",
  leadType: "all",
  calendar: "",
  dateFrom: "",
  dateTo: "",
  setter: "",
  booker: "",
  estadoAgenda: "",
  closer: "",
  vslOrigen: "",
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
export function rangeForPreset(preset: DatePreset, now = new Date()) {
  const today = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now) + "T12:00:00Z",
  );
  if (preset === "hoy") return { dateFrom: iso(today), dateTo: iso(today) };
  if (preset === "ayer") {
    today.setUTCDate(today.getUTCDate() - 1);
    return { dateFrom: iso(today), dateTo: iso(today) };
  }
  if (preset === "7dias") {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 6);
    return { dateFrom: iso(from), dateTo: iso(today) };
  }
  if (preset === "mes")
    return {
      dateFrom: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
      dateTo: iso(today),
    };
  if (preset === "mesPasado")
    return {
      dateFrom: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))),
      dateTo: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))),
    };
  return { dateFrom: "", dateTo: "" };
}

export function isValidReportRange(filters: Pick<ReportFilters, "dateFrom" | "dateTo">) {
  const validDate = (value: string) =>
    !value ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      iso(new Date(value)) === value);
  return (
    validDate(filters.dateFrom) &&
    validDate(filters.dateTo) &&
    (!filters.dateFrom || !filters.dateTo || filters.dateFrom <= filters.dateTo)
  );
}

export function changeReportFilters(
  previous: ReportFilters,
  next: Partial<ReportFilters>,
): ReportFilters {
  const merged = { ...previous, ...next };
  if (next.pipeline && next.pipeline !== previous.pipeline) {
    const person = previous.setter || previous.booker;
    const usesBooker = next.pipeline === "oei" || next.pipeline === "lig";
    merged.setter = usesBooker ? "" : person;
    merged.booker = usesBooker ? person : "";
    if (next.pipeline !== "vsl") {
      merged.leadType = "all";
      merged.vslOrigen = "";
      delete merged.vslTipo;
    }
  }
  return merged;
}
