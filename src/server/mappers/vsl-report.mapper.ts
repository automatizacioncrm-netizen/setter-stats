import type {
  DetailQuery,
  LeadDetailRow,
  ReportFilters,
  SetterRow,
  SheetRow,
  VslClosersReport,
} from "../../types/reports";
const keys = {
  "Agendado CRM": "agendadoCRM",
  Asistió: "asistio",
  Cancelado: "cancelado",
  "No show": "noShow",
  "Pendiente de agenda": "pendienteAgenda",
  Reagendado: "reagendado",
} as const;
const text = (value: unknown) => (value == null ? "" : String(value).replace(/\s+/g, " ").trim());
const empty = () => ({
  agendadoCRM: 0,
  asistio: 0,
  cancelado: 0,
  noShow: 0,
  pendienteAgenda: 0,
  reagendado: 0,
  total: 0,
});
export const defaultFilters: ReportFilters = {
  preset: "todos",
  dateFrom: "",
  dateTo: "",
  setter: "",
  estadoAgenda: "",
  closer: "",
  vslOrigen: "",
};
export const defaultDetail: DetailQuery = {
  includeDetail: false,
  search: "",
  page: 1,
  pageSize: 25,
  sort: "nombreContacto",
  direction: "asc",
};
function meetingDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}
export function mapSheetRowsToVslReport(
  rows: SheetRow[],
  filters = defaultFilters,
  detailQuery = defaultDetail,
  updatedAt = "",
  source: VslClosersReport["source"] = "sheet",
): VslClosersReport {
  const leads: LeadDetailRow[] = rows
    .filter((r) => text(r["Secuencia"]) === "VSL | CLOSERS")
    .map((r) => ({
      nombreContacto: text(r["Nombre contacto"]),
      telefono: text(r["Telefono"]),
      correo: text(r["Correo electrónico"]),
      setterAsignado: text(r["Setter asignado"]),
      closerAsignado: text(r["Asignado"]),
      vslOrigen: text(r["VSL Origen"]),
      estadoAgenda: text(r["Estado de agenda"]),
      fechaReunion: text(r["Fecha de reunión"]),
      fase: text(r["Fase"]),
      fuente: text(r["Fuente"]),
    }));
  const options = (key: keyof LeadDetailRow) =>
    [...new Set(leads.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const filtered = leads.filter((r) => {
    const day = meetingDay(r.fechaReunion);
    return (
      (!filters.dateFrom || (!!day && day >= filters.dateFrom)) &&
      (!filters.dateTo || (!!day && day <= filters.dateTo)) &&
      (!filters.setter || r.setterAsignado === filters.setter) &&
      (!filters.closer || r.closerAsignado === filters.closer) &&
      (!filters.estadoAgenda || r.estadoAgenda === filters.estadoAgenda) &&
      (!filters.vslOrigen || r.vslOrigen === filters.vslOrigen)
    );
  });
  const grouped = new Map<string, SetterRow>();
  let unknownStatusCount = 0;
  for (const lead of filtered) {
    if (!Object.hasOwn(keys, lead.estadoAgenda)) {
      unknownStatusCount++;
      continue;
    }
    const row = grouped.get(lead.setterAsignado) ?? { setter: lead.setterAsignado, ...empty() };
    row[keys[lead.estadoAgenda as keyof typeof keys]]++;
    row.total++;
    grouped.set(lead.setterAsignado, row);
  }
  const setters = [...grouped.values()].sort((a, b) => a.setter.localeCompare(b.setter, "es"));
  const totals = empty();
  for (const row of setters)
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += row[key];
  const search = detailQuery.search.trim().toLocaleLowerCase("es");
  const detail = filtered.filter((r) =>
    [r.nombreContacto, r.telefono, r.correo].some((v) =>
      v.toLocaleLowerCase("es").includes(search),
    ),
  );
  detail.sort(
    (a, b) =>
      a[detailQuery.sort].localeCompare(b[detailQuery.sort], "es", { numeric: true }) *
      (detailQuery.direction === "asc" ? 1 : -1),
  );
  const pageSize = Math.max(1, Math.min(100, detailQuery.pageSize));
  const page = Math.max(1, Math.min(detailQuery.page, Math.ceil(detail.length / pageSize) || 1));
  return {
    report: "VSL | CLOSERS",
    updatedAt,
    filters,
    source,
    setters,
    kpis: {
      ...totals,
      tasaAsistencia: totals.total ? +((totals.asistio / totals.total) * 100).toFixed(2) : 0,
      tasaNoShow: totals.total ? +((totals.noShow / totals.total) * 100).toFixed(2) : 0,
    },
    availableSetters: options("setterAsignado"),
    availableClosers: options("closerAsignado"),
    availableOrigins: options("vslOrigen"),
    unknownStatusCount,
    detailTotal: detail.length,
    detailPage: page,
    ...(detailQuery.includeDetail
      ? { detail: detail.slice((page - 1) * pageSize, page * pageSize) }
      : {}),
  };
}
