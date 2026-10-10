import type { ReportFilters, VslClosersReport } from "../types/reports";
/** The selector uses the empty string for all people, for both setter and booker. */
export function hasSelectedSetter(filters: Pick<ReportFilters, "setter" | "booker">) {
  return Boolean(filters.setter || filters.booker);
}
export function executiveCards(report: VslClosersReport, selected: boolean) {
  const value = (
    metric: "leads" | "appointments" | "attended" | "sales",
    number: number | undefined,
  ) => (report.executiveUnavailable?.includes(metric) || number == null ? "No disponible" : number);
  return [
    ...(!selected
      ? [{ label: "Total de leads", value: value("leads", report.leadTypeKpis.totalLeads) }]
      : []),
    {
      label: "Total de agendamientos",
      value: value("appointments", report.kpis.total),
      hint: `${value("appointments", report.kpis.total)} citas en el período seleccionado`,
    },
    {
      label: "Asistió",
      value: value("attended", report.kpis.asistio),
      accent: "var(--status-asistio)",
      hint: `${report.kpis.tasaAsistencia}% de asistencia`,
    },
    {
      label: "Total de ventas",
      value: report.salesAvailable ? value("sales", report.sales.total) : "No disponible",
      accent: "var(--status-asistio)",
    },
  ];
}
