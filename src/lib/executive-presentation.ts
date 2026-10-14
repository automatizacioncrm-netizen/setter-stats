import type { ReportFilters, VslClosersReport } from "../types/reports";
/** The selector uses the empty string for all people, for both setter and booker. */
export function hasSelectedSetter(filters: Pick<ReportFilters, "setter" | "booker">) {
  return Boolean(filters.setter || filters.booker);
}
export function executiveCards(report: VslClosersReport, selected: boolean, pipeline = "all") {
  const value = (
    metric: "leads" | "appointments" | "attended" | "sales",
    number: number | undefined,
  ) => (report.executiveUnavailable?.includes(metric) || number == null ? "No disponible" : number);
  return [
    ...(!selected
      ? [{ label: "Total de leads", value: value("leads", report.leadTypeKpis.totalLeads) }]
      : []),
    {
      label: "Leads seteados",
      value: value("appointments", report.kpis.total),
      hint:
        value("appointments", report.kpis.total) === "No disponible" ||
        value("leads", report.leadTypeKpis.totalLeads) === "No disponible" ||
        !Number.isFinite(report.kpis.total) ||
        !Number.isFinite(report.leadTypeKpis.totalLeads) ||
        report.leadTypeKpis.totalLeads <= 0
          ? "Porcentaje no disponible"
          : `${Number(((report.kpis.total / report.leadTypeKpis.totalLeads) * 100).toFixed(1))}% de los leads${["vsl", "oei", "lig"].includes(pipeline) ? ` ${pipeline.toUpperCase()}` : ""}`,
    },
    {
      label: "Leads asistidos",
      value: value("attended", report.kpis.asistio),
      accent: "var(--status-asistio)",
      hint:
        value("attended", report.kpis.asistio) === "No disponible" ||
        value("appointments", report.kpis.total) === "No disponible"
          ? "Porcentaje no disponible"
          : `${report.kpis.tasaAsistencia}% de asistencia`,
    },
    {
      label: "Total de ventas",
      value: report.salesAvailable ? value("sales", report.sales.total) : "No disponible",
      accent: "var(--status-asistio)",
    },
  ];
}
