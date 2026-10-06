import type { ReportFilters, VslReport, VslClosersReport } from "@/types/reports";

/** Supply only UI compatibility fields; preserve all API aggregates as received. */
export function toReportView(
  report: VslReport,
  filters: ReportFilters,
  page: number,
): VslClosersReport & { detailTotalKnown: boolean } {
  const available = report.filters?.available;
  const applied = report.filters?.applied;
  const array = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
  return {
    ...report,
    leadType: report.leadType as VslClosersReport["leadType"],
    updatedAt: report.updatedAt ?? "",
    filters: {
      ...filters,
      ...applied,
      estadoAgenda: applied?.["status"] ?? filters.estadoAgenda,
      vslOrigen: applied?.["vslOrigin"] ?? filters.vslOrigen,
    },
    kpis: {
      totalLeads: report.kpis.total,
      conEstadoAgenda: report.kpis.total,
      agendadoCRM: 0,
      pendienteAgenda: 0,
      reagendado: 0,
      ...report.kpis,
    },
    setters: array(report.setters).map((row) => ({
      agendadoCRM: 0,
      pendienteAgenda: 0,
      reagendado: 0,
      ...row,
    })),
    sales: {
      ...report.sales,
      total: report.sales?.total ?? 0,
      byStage: array(report.sales?.byStage),
      cashByCurrency: array(report.sales?.cashByCurrency),
      productSummary: array(report.sales?.productSummary),
      salesValueByCurrency: array(report.sales?.salesValueByCurrency),
      rows: array(report.sales?.rows),
    },
    salesAvailable: true,
    leadTypeKpis: {
      totalLeads: report.kpis.total,
      attended: report.kpis.asistio,
      attendanceRate: report.kpis.tasaAsistencia,
    },
    availableSetters: array(available?.["setters"]),
    availableBookers: array(available?.["bookers"]),
    availableClosers: array(available?.["closers"]),
    availableOrigins: array(available?.["origins"]),
    availableCalendars: array(available?.["calendars"]),
    availableStatuses: array(available?.["statuses"]),
    unknownStatusCount: 0,
    source: "sheet",
    detail: array(report.detail),
    detailTotal: report.pagination?.totalDetail ?? array(report.detail).length,
    detailTotalKnown: report.pagination?.totalDetail !== undefined,
    detailPage: report.pagination?.page ?? page,
  };
}
