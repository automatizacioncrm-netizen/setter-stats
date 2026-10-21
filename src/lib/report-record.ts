interface ReportRecord {
  pipeline?: string | null;
  setterAsignado?: string | null;
  agendadorCita?: string | null;
  createdByUserName?: string | null;
  fechaVenta?: string | null;
  appointmentCreatedAt?: string | null;
  vslOrigen?: string | null;
  fuente?: string | null;
  vslCategoria?: string | null;
  fechaCita?: string | null;
  fechaReunion?: string | null;
}

export function getEffectiveSetter(record?: ReportRecord | null): string {
  if (
    record?.pipeline === "oei" ||
    record?.pipeline === "lig" ||
    record?.pipeline === "organico" ||
    record?.pipeline === "gira"
  ) {
    return record.agendadorCita || record.createdByUserName || record.setterAsignado || "";
  }
  return record?.setterAsignado || record?.agendadorCita || record?.createdByUserName || "";
}

export function getEffectiveBooker(record?: ReportRecord | null): string {
  return record?.agendadorCita || record?.createdByUserName || "";
}

export function getEffectiveAppointmentDate(record?: ReportRecord | null): string {
  return record?.appointmentCreatedAt || record?.fechaCita || record?.fechaReunion || "";
}

export function getEffectiveSaleDate(record?: ReportRecord | null): string {
  return record?.fechaVenta || getEffectiveAppointmentDate(record);
}

export function getEffectiveVslOrigin(record?: ReportRecord | null): string {
  return record?.vslOrigen || record?.fuente || "";
}

const normalizeOrigin = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

const paidOrigins = new Set(
  [
    "VSL FUNNEL",
    "VSL FUNNEL (B)",
    "CUESTIONARIO DE APLICACIÓN - VSL FUNNEL",
    "CUESTIONARIO DE APLICACIÓN - VSL FUNNEL (B)",
    'Encuesta al Lead: "Orden Empresarial Intensivo" 31 de agosto, 01 y 02 de septiembre 2026',
  ].map(normalizeOrigin),
);

export function getVslType(record?: ReportRecord | null): string {
  if (
    record?.pipeline === "vsl" &&
    [getEffectiveVslOrigin(record), record.fuente || ""].some((origin) =>
      paidOrigins.has(normalizeOrigin(origin)),
    )
  )
    return "paid";
  return record?.vslCategoria || "organic";
}

/** Resolve display and local sort values without changing the API's records. */
export function getReportRecordValue<T extends ReportRecord>(record: T, key: keyof T) {
  if (key === "setterAsignado") return getEffectiveSetter(record);
  if (key === "agendadorCita") return getEffectiveBooker(record);
  if (key === "fechaAgendamiento") return getEffectiveAppointmentDate(record);
  if (key === "fechaVenta") return getEffectiveSaleDate(record);
  if (key === "vslOrigen") return getEffectiveVslOrigin(record);
  if (key === "closerCita") {
    const person = record as T & { closerCita?: string; closerAsignado?: string };
    return person.closerCita || person.closerAsignado || "";
  }
  return record[key] ?? "";
}
