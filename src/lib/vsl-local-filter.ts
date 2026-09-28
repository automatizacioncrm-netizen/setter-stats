import { getVslType } from "./report-record";
import type { DetailQuery, LeadType, VslClosersReport } from "@/types/reports";

export function filtrarPorTipoVsl<T extends Parameters<typeof getVslType>[0]>(
  data: T[],
  tipo: LeadType,
): T[] {
  return tipo === "all" ? data : data.filter((record) => getVslType(record) === tipo);
}

/** Preserve API totals and records; all report filtering is server-side. */
export function filtrarReporteVsl(
  report: VslClosersReport,
  _tipo: LeadType,
  _detail: DetailQuery,
  _search = "",
): VslClosersReport {
  return report;
}
