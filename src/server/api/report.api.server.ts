import { z } from "zod";
import { fetchVslReport, fetchAppointmentDetail } from "../adapters/apps-script.adapter.server";
import { mapVslReportResponse } from "../mappers/vsl-response.mapper";

import { apiError, ApiError } from "../config/env.server";
const date = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
  );
const schema = z.object({
  pipeline: z.enum(["all", "vsl", "oei", "lig"]).default("all"),
  leadType: z.enum(["all", "paid", "organic"]).default("all"),
  calendar: z.string().max(300).default(""),
  dateFrom: date.default(""),
  dateTo: date.default(""),
  setter: z.string().max(300).default(""),
  booker: z.string().max(300).default(""),
  status: z.string().max(100).default(""),
  closer: z.string().max(300).default(""),
  vslOrigin: z.string().max(300).default(""),
  includeDetail: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  search: z.string().max(300).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z
    .enum([
      "nombreContacto",
      "telefono",
      "correo",
      "setterAsignado",
      "closerAsignado",
      "vslOrigen",
      "estadoAgenda",
      "fechaReunion",
      "fase",
      "fuente",
    ])
    .default("nombreContacto"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
const appointmentDetailSchema = schema
  .omit({ includeDetail: true, sort: true, direction: true })
  .extend({
    vslTipo: z.string().max(300).optional(),
    dateField: z.enum(["appointmentCreated", "meetingDate"]).optional(),
    bookingMode: z.enum(["", "automatic", "manual"]).optional(),
    dayGap: z.string().max(100).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  });
const detailResponseSchema = z.object({
  filters: z.object({}).passthrough().optional(),
  rows: z.array(z.object({}).passthrough()),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalRecords: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
  summary: z.object({
    total: z.number(),
    confirmado: z.number(),
    asistio: z.number(),
    cancelado: z.number(),
    noShow: z.number(),
    tasaAsistencia: z.number(),
  }),
});
export async function reportApi(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("action") === "appointment_detail") {
      const parsed = appointmentDetailSchema.safeParse(Object.fromEntries(params));
      if (!parsed.success) throw new ApiError("Los filtros o la paginación no son válidos.", 400);
      const q = parsed.data;
      if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo)
        throw new ApiError("La fecha Desde debe ser anterior o igual a Hasta.", 400);
      const envelope = (await fetchAppointmentDetail(q)) as { data?: unknown };
      const result = detailResponseSchema.safeParse(envelope.data ?? envelope);
      if (!result.success)
        throw new ApiError("El detalle de agendamientos tiene un formato inválido.");
      if (process.env["NODE_ENV"] !== "production") {
        console.debug("[appointment_detail]", {
          filters: q,
          totalRecords: result.data.pagination.totalRecords,
          rowsReceived: result.data.rows.length,
        });
      }
      return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = schema.safeParse(Object.fromEntries(params));
    if (!parsed.success) throw new ApiError("Los filtros o la paginación no son válidos.", 400);
    const q = parsed.data;
    if (q.pipeline !== "vsl") q.leadType = "all";
    if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo)
      throw new ApiError("La fecha Desde debe ser anterior o igual a Hasta.", 400);
    const data = mapVslReportResponse(await fetchVslReport(q), q);
    if (process.env["NODE_ENV"] !== "production" && process.env["REPORTS_DEBUG"] === "true")
      console.info("[REPORTS] Final response", {
        pipeline: q.pipeline,
        detailRows: data.detail?.length,
        total: data.detailTotal,
        page: data.detailPage,
        calendars: data.availableCalendars?.length,
      });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
