import { z } from "zod";
import type {
  LeadDetailRow,
  ReportKpis,
  SalesReport,
  SetterRow,
  VslClosersReport,
} from "../../types/reports";
import { ApiError } from "../config/env.server";

const envelope = z.object({ ok: z.literal(true), data: z.record(z.unknown()) });
export const vslResponseSchema = envelope;
export type AppsScriptReportResponse = z.infer<typeof envelope>;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (value == null ? "" : String(value));
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const strings = (value: unknown): string[] => array(value).map(str).filter(Boolean);
const namedCounts = (value: unknown, key: "agendador" | "closer") =>
  array(value)
    .map((item) => {
      const row = object(item);
      return {
        name: str(row["setterEfectivo"] || row["agendadoPor"] || row[key]),
        ...(row["setterEfectivo"] != null ? { setterEfectivo: str(row["setterEfectivo"]) } : {}),
        total: num(row["total"]),
        ...Object.fromEntries(Object.entries(counts(row)).filter(([field]) => row[field] != null)),
      };
    })
    .filter((item) => item.name);
const status = (value: unknown): string => (str(value) === "No show" ? "No asistió" : str(value));
const counts = (row: Record<string, unknown>) => ({
  agendadoCRM: num(row["agendadoCRM"]),
  confirmado: num(row["confirmado"]),
  asistio: num(row["asistio"]),
  cancelado: num(row["cancelado"]),
  noShow: num(row["noShow"]),
  pendienteAgenda: num(row["pendienteAgenda"]),
  reagendado: num(row["reagendado"]),
});

function salesReport(value: unknown): SalesReport {
  const sales = object(value);
  return {
    total: num(sales["total"]),
    byStage: array(sales["byStage"]).map((item) => ({
      stage: str(object(item)["stage"]),
      count: num(object(item)["count"]),
    })),
    cashByCurrency: array(sales["cashByCurrency"]).map((item) => ({
      currency: str(object(item)["currency"]),
      amount: num(object(item)["amount"]),
    })),
    salesValueByCurrency: array(sales["salesValueByCurrency"]).map((item) => {
      const row = object(item);
      return {
        currency: str(row["currency"]),
        salesValue: num(row["salesValue"]),
        cashCollected: num(row["cashCollected"]),
        collectedRate: num(row["collectedRate"]),
      };
    }),
    productSummary: array(sales["productSummary"]).map((item) => {
      const row = object(item);
      return {
        producto: str(row["producto"]),
        cantidad: num(row["cantidad"]),
        moneda: str(row["moneda"]),
        ticket: num(row["ticket"]),
        valorVenta: num(row["valorVenta"]),
        cashRecaudado: num(row["cashRecaudado"]),
        porcentajeRecaudado: num(row["porcentajeRecaudado"]),
      };
    }),
    rows: array(sales["rows"]).map((item) => {
      const row = object(item);
      return {
        ...(row["vslCategoria"] != null
          ? {
              vslCategoria:
                str(row["vslCategoria"]) === "paid" ? ("paid" as const) : ("organic" as const),
            }
          : {}),
        vslOrigen: str(row["vslOrigen"]),
        pipeline: str(row["pipeline"]),
        secuencia: str(row["secuencia"]),
        calendarioCita: str(row["calendarioCita"]),
        productoEvento: str(row["productoEvento"]),
        fechaPrimerPago: str(row["fechaPrimerPago"]),
        ...(row["appointmentCreatedAt"] != null
          ? { appointmentCreatedAt: str(row["appointmentCreatedAt"]) }
          : {}),
        ...(row["fechaVenta"] != null ? { fechaVenta: str(row["fechaVenta"]) } : {}),
        planPagos: str(row["planPagos"]),
        numeroCuotasPactadas: num(row["numeroCuotasPactadas"]),
        moneda: str(row["moneda"]),
        montoTotalAcordado: num(row["montoTotalAcordado"]),
        montoUltimoPago: num(row["montoUltimoPago"]),
        setterAsignado: str(row["setterAsignado"]),
        agendadorCita: str(row["agendadorCita"]),
        createdByUserName: str(row["createdByUserName"]),
        closerAsignado: str(row["closerAsignado"]),
        closerCita: str(row["closerCita"]),
        nombreContacto: str(row["nombreContacto"]),
        fase: str(row["fase"]),
        fuente: str(row["fuente"]),
        fechaCita: str(row["fechaCita"]),
        fechaAgendamiento: str(row["fechaAgendamiento"]),
        estadoAgenda: status(row["estadoAgenda"]),
        estadoCita: str(row["estadoCita"]),
        fechaReunion: str(row["fechaReunion"]),
      };
    }),
  };
}

export function mapVslReportResponse(
  raw: unknown,
  query: {
    pipeline?: "all" | "vsl" | "oei" | "lig";
    leadType?: "all" | "paid" | "organic";
    calendar?: string;
    dateFrom: string;
    dateTo: string;
    setter: string;
    booker?: string;
    status: string;
    closer: string;
    vslOrigin: string;
    includeDetail: boolean;
    pageSize: number;
    sort: keyof LeadDetailRow;
    direction: "asc" | "desc";
  },
): VslClosersReport {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success)
    throw new ApiError("Apps Script devolvió una respuesta de reporte inválida.");
  const d = parsed.data.data;
  const available = object(object(d["filters"])["available"]);
  const rawKpis = object(d["kpis"]);
  const legacyKpis = object(d["leadTypeKpis"]);
  const kpiCounts = counts(rawKpis);
  const conEstadoAgenda =
    num(rawKpis["conEstadoAgenda"]) ||
    Object.values(kpiCounts).reduce((sum, value) => sum + value, 0);
  const total = num(rawKpis["total"] ?? legacyKpis["totalAppointments"]);
  const totalLeads = num(legacyKpis["totalLeads"] ?? rawKpis["totalLeads"]);
  const kpis: ReportKpis = {
    ...kpiCounts,
    total,
    totalLeads,
    conEstadoAgenda,
    tasaAsistencia: num(rawKpis["tasaAsistencia"]),
    tasaNoShow: num(rawKpis["tasaNoShow"]),
  };
  const detail = object(d["detail"]);
  const pagination = object(detail["pagination"]);
  // estadoAgenda is the API's effective status; never recompute it from the original fields.
  const mapRecord = (item: unknown): LeadDetailRow => {
    const row = object(item);
    return {
      vslCategoria: str(row["vslCategoria"]) === "paid" ? "paid" : "organic",
      asignado: str(row["asignado"]),
      creadoPorCita: str(row["creadoPorCita"]),
      planPago: str(row["planPago"]),
      numeroCuotas: num(row["numeroCuotas"]),
      pipeline: str(row["pipeline"]),
      secuencia: str(row["secuencia"]),
      nombreContacto: str(row["nombreContacto"]),
      fechaCreacionOportunidad: str(row["fechaCreacionOportunidad"]),
      telefono: str(row["telefono"]),
      correo: str(row["correo"]),
      setterAsignado: str(row["setterAsignado"]),
      agendadorCita: str(row["agendadorCita"]),
      createdByUserName: str(row["createdByUserName"]),
      closerAsignado: str(row["closerAsignado"]),
      closerOpportunity: str(row["closerOpportunity"]),
      closerCita: str(row["closerCita"]),
      calendarioCita: str(row["calendarioCita"]),
      vslOrigen: str(row["vslOrigen"]),
      estadoAgenda: status(row["estadoAgenda"]),
      estadoCita: str(row["estadoCita"]),
      estadoAgendaOriginal: str(row["estadoAgendaOriginal"]),
      fuenteEstadoAgendamiento: str(row["fuenteEstadoAgendamiento"]),
      fechaAgendamiento: str(row["fechaAgendamiento"]),
      fechaCita: str(row["fechaCita"]),
      fechaReunion: str(row["fechaReunion"]),
      fase: str(row["fase"]),
      fuente: str(row["fuente"]),
      productoEvento: str(row["productoEvento"]),
      fechaPrimerPago: str(row["fechaPrimerPago"]),
      ...(row["appointmentCreatedAt"] != null
        ? { appointmentCreatedAt: str(row["appointmentCreatedAt"]) }
        : {}),
      ...(row["fechaVenta"] != null ? { fechaVenta: str(row["fechaVenta"]) } : {}),
      planPagos: str(row["planPagos"] ?? row["planPago"]),
      numeroCuotasPactadas: num(row["numeroCuotasPactadas"] ?? row["numeroCuotas"]),
      moneda: str(row["moneda"]),
      montoTotalAcordado: num(row["montoTotalAcordado"]),
      montoUltimoPago: num(row["montoUltimoPago"]),
      leadType: str(row["leadType"]),
    };
  };
  const rows: LeadDetailRow[] = array(detail["rows"]).map(mapRecord);
  const rawRecords = Array.isArray(d["rawRecords"])
    ? array(d["rawRecords"]).map(mapRecord)
    : undefined;
  const rawSummary = object(d["vslSummary"]);
  const vslSummary = Object.keys(rawSummary).length
    ? (Object.fromEntries(
        (["all", "paid", "organic"] as const).map((type) => {
          const item = object(rawSummary[type]);
          return [
            type,
            {
              totalLeads: num(item["totalLeads"]),
              totalCitas: num(item["totalCitas"]),
              asistencias: num(item["asistencias"]),
              ventas: num(item["ventas"]),
            },
          ];
        }),
      ) as VslClosersReport["vslSummary"])
    : undefined;
  const sorted = rows
    .slice(0, query.pageSize)
    .sort(
      (a, b) =>
        str(a[query.sort]).localeCompare(str(b[query.sort]), "es", { numeric: true }) *
        (query.direction === "asc" ? 1 : -1),
    );
  const setters: SetterRow[] = array(d["setters"]).map((item) => {
    const row = object(item);
    return {
      setter: str(row["setterEfectivo"] || row["agendadoPor"] || row["setter"]),
      ...(row["setterEfectivo"] != null ? { setterEfectivo: str(row["setterEfectivo"]) } : {}),
      ...(row["agendadoPor"] != null ? { agendadoPor: str(row["agendadoPor"]) } : {}),
      ...counts(row),
      total: num(row["total"]),
    };
  });
  const responseLeadType = str(d["leadType"]);
  const leadType = query.pipeline
    ? query.pipeline === "vsl"
      ? (query.leadType ?? "all")
      : "all"
    : responseLeadType === "organic" || responseLeadType === "paid"
      ? responseLeadType
      : (query.leadType ?? "paid");
  const appointmentPeople = object(d["appointmentPeople"]);
  const oeiBookers = namedCounts(appointmentPeople["oeiBookers"], "agendador");
  const ligBookers = namedCounts(appointmentPeople["ligBookers"], "agendador");
  // The API may return the same creator in both pipelines: combine their totals.
  const bookerTotals = new Map<string, number>();
  const allBookers = Array.isArray(appointmentPeople["bookers"])
    ? namedCounts(appointmentPeople["bookers"], "agendador")
    : [...oeiBookers, ...ligBookers];
  for (const person of allBookers)
    bookerTotals.set(person.name, (bookerTotals.get(person.name) ?? 0) + person.total);
  const bookers = [...bookerTotals].map(([name, total]) => ({ name, total }));
  const appointmentClosers = namedCounts(appointmentPeople["closers"], "closer");
  return {
    report: str(d["report"]),
    ...(rawRecords ? { rawRecords } : {}),
    ...(vslSummary ? { vslSummary } : {}),
    ...(d["dateSemantics"]
      ? {
          dateSemantics: {
            leads: str(object(d["dateSemantics"])["leads"]),
            appointments: str(object(d["dateSemantics"])["appointments"]),
            appointmentsFallback: str(object(d["dateSemantics"])["appointmentsFallback"]),
            sales: str(object(d["dateSemantics"])["sales"]),
          },
        }
      : {}),
    updatedAt: str(d["updatedAt"]),
    source: "sheet",
    leadType,
    filters: {
      pipeline: query.pipeline ?? "all",
      leadType,
      calendar: query.calendar ?? "",
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      setter: query.setter,
      booker: query.booker ?? "",
      estadoAgenda: query.status,
      closer: query.closer,
      vslOrigen: query.vslOrigin,
    },
    kpis,
    leadTypeKpis: {
      totalLeads: num(legacyKpis["totalLeads"] ?? rawKpis["totalLeads"]),
      ...(legacyKpis["totalAppointments"] != null
        ? { totalAppointments: num(legacyKpis["totalAppointments"]) }
        : {}),
      attended: num(legacyKpis["attended"] ?? kpis.asistio),
      attendanceRate: num(legacyKpis["attendanceRate"] ?? kpis.tasaAsistencia),
    },
    setters,
    sales: salesReport(d["sales"]),
    salesAvailable: d["sales"] != null,
    availableSetters: strings(available["setters"]),
    availableBookers: Array.isArray(available["bookers"])
      ? strings(available["bookers"])
      : (query.pipeline === "oei"
          ? oeiBookers
          : query.pipeline === "lig"
            ? ligBookers
            : bookers
        ).map((item) => item.name),
    availableClosers:
      appointmentClosers.length > 0
        ? appointmentClosers.map((item) => item.name)
        : strings(available["closers"]),
    availableOrigins: strings(available["vslOrigins"]),
    availableCalendars: strings(available["calendars"]),
    availableStatuses: strings(available["statuses"]).map(status),
    pipelineSummary: object(d["pipelineSummary"]),
    appointmentPeople: { oeiBookers, ligBookers, bookers, closers: appointmentClosers },
    unknownStatusCount: num(d["unknownStatusCount"]),
    detail: query.includeDetail ? sorted : [],
    detailTotal: num(pagination["totalRecords"] ?? detail["totalRecords"] ?? detail["total"]),
    detailPage: num(pagination["page"] ?? detail["page"]) || 1,
  };
}
