import type { ReportFilters, VslClosersReport } from "../types/reports";

const countKeys = [
  "agendadoCRM",
  "confirmado",
  "asistio",
  "cancelado",
  "noShow",
  "pendienteAgenda",
  "reagendado",
  "total",
];
const rate = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 10000) / 100 : 0;

function mergeGroups<T extends object>(
  rows: T[],
  identify: (row: T) => string,
  keys: string[],
): T[] {
  const groups = new Map<string, T>();
  for (const row of rows) {
    const key = identify(row);
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, { ...row });
      continue;
    }
    const result = { ...previous } as Record<string, unknown>;
    const next = row as Record<string, unknown>;
    for (const field of keys)
      if (next[field] != null) result[field] = Number(result[field] ?? 0) + Number(next[field]);
    groups.set(key, result as T);
  }
  return [...groups.values()];
}

/** Combine disjoint exact-name API responses; never derive sales from appointment rows. */
export function mergeFilteredReports(
  reports: VslClosersReport[],
  filters: ReportFilters,
): VslClosersReport {
  const first = reports[0];
  if (!first) throw new Error("No se pudo obtener el reporte seleccionado.");
  const sum = (read: (report: VslClosersReport) => number | undefined) =>
    reports.reduce((total, report) => total + (read(report) ?? 0), 0);
  const counts = (keys: string[], read: (report: VslClosersReport) => object) =>
    Object.fromEntries(
      keys.map((key) => [
        key,
        sum((report) => Number((read(report) as Record<string, unknown>)[key] ?? 0)),
      ]),
    );
  const kpis = {
    ...first.kpis,
    ...counts([...countKeys, "totalLeads", "conEstadoAgenda"], (report) => report.kpis),
  };
  kpis.tasaAsistencia = rate(kpis.asistio, kpis.total);
  kpis.tasaNoShow = rate(kpis.noShow, kpis.total);
  const appointmentTotal = sum(
    (report) => report.leadTypeKpis.totalAppointments ?? report.kpis.total,
  );
  const productSummary = mergeGroups(
    reports.flatMap((report) => report.sales.productSummary),
    (row) => JSON.stringify([row.producto, row.moneda, row.ticket]),
    ["cantidad", "valorVenta", "cashRecaudado"],
  ).map((row) => ({ ...row, porcentajeRecaudado: rate(row.cashRecaudado, row.valorVenta) }));
  const salesValueByCurrency = mergeGroups(
    reports.flatMap((report) => report.sales.salesValueByCurrency),
    (row) => row.currency,
    ["salesValue", "cashCollected"],
  ).map((row) => ({ ...row, collectedRate: rate(row.cashCollected, row.salesValue) }));
  const pipelineSummary = Object.fromEntries(
    [...new Set(reports.flatMap((report) => Object.keys(report.pipelineSummary ?? {})))].map(
      (pipeline) => {
        const sections = reports.map(
          (report) => (report.pipelineSummary?.[pipeline] ?? {}) as Record<string, unknown>,
        );
        const section = sections[0] ?? {};
        const sumSection = (key: string) =>
          sections.reduce((total, item) => total + Number(item[key] ?? 0), 0);
        const statuses = Object.fromEntries(
          countKeys
            .filter((key) => key !== "total")
            .map((key) => [
              key,
              sections.reduce(
                (total, item) =>
                  total +
                  Number((item["estados"] as Record<string, unknown> | undefined)?.[key] ?? 0),
                0,
              ),
            ]),
        );
        const calendars = mergeGroups(
          sections.flatMap(
            (item) => (item["calendars"] ?? []) as { calendar: string; count: number }[],
          ),
          (row) => row.calendar,
          ["count"],
        );
        return [
          pipeline,
          {
            ...section,
            totalLeads: sumSection("totalLeads"),
            conCitaCalendar: sumSection("conCitaCalendar"),
            sinCitaCalendar: sumSection("sinCitaCalendar"),
            estados: statuses,
            calendars,
          },
        ];
      },
    ),
  );
  const people = (key: "oeiBookers" | "ligBookers" | "bookers" | "closers") =>
    mergeGroups(
      reports.flatMap((report) => report.appointmentPeople?.[key] ?? []),
      (row) => row.name,
      countKeys,
    );
  const options = (
    key:
      | "availableSetters"
      | "availableBookers"
      | "availableClosers"
      | "availableOrigins"
      | "availableCalendars"
      | "availableStatuses",
  ) => [...new Set(reports.flatMap((report) => report[key] ?? []))];
  const { preset: _preset, ...applied } = filters;
  return {
    ...first,
    filters: applied,
    kpis,
    leadTypeKpis: {
      totalLeads: sum((report) => report.leadTypeKpis.totalLeads),
      totalAppointments: appointmentTotal,
      attended: sum((report) => report.leadTypeKpis.attended),
      attendanceRate: rate(
        sum((report) => report.leadTypeKpis.attended),
        appointmentTotal,
      ),
    },
    setters: mergeGroups(
      reports.flatMap((report) => report.setters),
      (row) => row.setter,
      countKeys,
    ),
    pipelineSummary,
    appointmentPeople: {
      oeiBookers: people("oeiBookers"),
      ligBookers: people("ligBookers"),
      bookers: people("bookers"),
      closers: people("closers"),
    },
    sales: {
      ...first.sales,
      total: sum((report) => report.sales.total),
      byStage: mergeGroups(
        reports.flatMap((report) => report.sales.byStage),
        (row) => row.stage,
        ["count"],
      ),
      cashByCurrency: mergeGroups(
        reports.flatMap((report) => report.sales.cashByCurrency),
        (row) => row.currency,
        ["amount"],
      ),
      salesValueByCurrency,
      productSummary,
      rows: reports.flatMap((report) => report.sales.rows),
      ...(reports.some((report) => report.sales.detailRows !== undefined)
        ? { detailRows: reports.flatMap((report) => report.sales.detailRows ?? report.sales.rows) }
        : {}),
    },
    salesAvailable: reports.every((report) => report.salesAvailable),
    availableSetters: options("availableSetters"),
    availableBookers: options("availableBookers"),
    availableClosers: options("availableClosers"),
    availableOrigins: options("availableOrigins"),
    availableCalendars: options("availableCalendars"),
    availableStatuses: options("availableStatuses"),
    unknownStatusCount: sum((report) => report.unknownStatusCount),
    detail: reports.flatMap((report) => report.detail ?? []),
    detailTotal: sum((report) => report.detailTotal),
    ...(reports.some((report) => report.rawRecords)
      ? { rawRecords: reports.flatMap((report) => report.rawRecords ?? []) }
      : {}),
    ...(first.vslSummary
      ? {
          vslSummary: Object.fromEntries(
            (["all", "paid", "organic"] as const).map((type) => [
              type,
              {
                totalLeads: sum((report) => report.vslSummary?.[type].totalLeads),
                totalCitas: sum((report) => report.vslSummary?.[type].totalCitas),
                asistencias: sum((report) => report.vslSummary?.[type].asistencias),
                ventas: sum((report) => report.vslSummary?.[type].ventas),
              },
            ]),
          ) as NonNullable<VslClosersReport["vslSummary"]>,
        }
      : {}),
  };
}
