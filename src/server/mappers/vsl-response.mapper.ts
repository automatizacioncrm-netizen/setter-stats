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
        productoEvento: str(row["productoEvento"]),
        moneda: str(row["moneda"]),
        montoUltimoPago: num(row["montoUltimoPago"]),
        setterAsignado: str(row["setterAsignado"]),
        closerAsignado: str(row["closerAsignado"]),
        nombreContacto: str(row["nombreContacto"]),
        fase: str(row["fase"]),
        fuente: str(row["fuente"]),
        fechaReunion: str(row["fechaReunion"]),
      };
    }),
  };
}

export function mapVslReportResponse(
  raw: unknown,
  query: {
    pipeline?: "all" | "vsl" | "oei";
    leadType?: "all" | "paid" | "organic";
    calendar?: string;
    dateFrom: string;
    dateTo: string;
    setter: string;
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
  const kpiCounts = counts(rawKpis);
  const conEstadoAgenda =
    num(rawKpis["conEstadoAgenda"]) ||
    Object.values(kpiCounts).reduce((sum, value) => sum + value, 0);
  const total = num(
    rawKpis["total"] ?? rawKpis["totalLeads"] ?? object(d["leadTypeKpis"])["totalLeads"],
  );
  const kpis: ReportKpis = {
    ...kpiCounts,
    total,
    totalLeads: total,
    conEstadoAgenda,
    tasaAsistencia: num(rawKpis["tasaAsistencia"]),
    tasaNoShow: num(rawKpis["tasaNoShow"]),
  };
  const detail = object(d["detail"]);
  const pagination = object(detail["pagination"]);
  // estadoAgenda is the API's effective status; never recompute it from the original fields.
  const rows: LeadDetailRow[] = array(detail["rows"]).map((item) => {
    const row = object(item);
    return {
      pipeline: str(row["pipeline"]),
      secuencia: str(row["secuencia"]),
      nombreContacto: str(row["nombreContacto"]),
      telefono: str(row["telefono"]),
      correo: str(row["correo"]),
      setterAsignado: str(row["setterAsignado"]),
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
      moneda: str(row["moneda"]),
      montoUltimoPago: num(row["montoUltimoPago"]),
      leadType: str(row["leadType"]),
    };
  });
  const sorted = rows
    .slice(0, query.pageSize)
    .sort(
      (a, b) =>
        str(a[query.sort]).localeCompare(str(b[query.sort]), "es", { numeric: true }) *
        (query.direction === "asc" ? 1 : -1),
    );
  const setters: SetterRow[] = array(d["setters"]).map((item) => {
    const row = object(item);
    return { setter: str(row["setter"]), ...counts(row), total: num(row["total"]) };
  });
  const leadType = query.pipeline === "vsl" ? (query.leadType ?? "all") : "all";
  const legacyKpis = object(d["leadTypeKpis"]);
  return {
    report: str(d["report"]),
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
      estadoAgenda: query.status,
      closer: query.closer,
      vslOrigen: query.vslOrigin,
    },
    kpis,
    leadTypeKpis: {
      totalLeads: num(legacyKpis["totalLeads"] ?? total),
      attended: num(legacyKpis["attended"] ?? kpis.asistio),
      attendanceRate: num(legacyKpis["attendanceRate"] ?? kpis.tasaAsistencia),
    },
    setters,
    sales: salesReport(d["sales"]),
    salesAvailable: d["sales"] != null,
    availableSetters: strings(available["setters"]),
    availableClosers: strings(available["closers"]),
    availableOrigins: strings(available["vslOrigins"]),
    availableCalendars: strings(available["calendars"]),
    availableStatuses: strings(available["statuses"]).map(status),
    pipelineSummary: object(d["pipelineSummary"]),
    unknownStatusCount: num(d["unknownStatusCount"]),
    detail: query.includeDetail ? sorted : [],
    detailTotal: num(pagination["totalRecords"] ?? detail["totalRecords"] ?? detail["total"]),
    detailPage: num(pagination["page"] ?? detail["page"]) || 1,
  };
}
