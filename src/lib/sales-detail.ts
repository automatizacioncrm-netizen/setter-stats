import type { SaleRow } from "../types/reports";
import { formatCurrency } from "./currency";
import { getReportRecordValue } from "./report-record";

export function formatSaleQuotaDate(value?: string): string {
  if (!value) return "—";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const calendar = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return calendar
    ? `${calendar[1]!.padStart(2, "0")}/${calendar[2]!.padStart(2, "0")}/${calendar[3]}`
    : "—";
}

export function saleDetailValue(row: SaleRow, key: keyof SaleRow) {
  // The API has already resolved attribution. Keep setter and booker independent.
  if (key === "setterAsignado") {
    const setter = row.setterAsignado || "";
    return setter === "Agendado automático" || setter === "Agendado automatico" ? "" : setter;
  }
  if (key === "agendadorCita") return row.agendadorCita || "";
  return getReportRecordValue(row, key);
}

export function formatSaleDetailAmount(
  row: SaleRow,
  key: "precioAcordadoProducto" | "montoCuota1",
) {
  const amount = row[key];
  return amount == null ? "—" : formatCurrency(amount, row.monedaPrecioAcordado || "");
}
