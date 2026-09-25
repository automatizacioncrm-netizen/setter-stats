import { z } from "zod";
import { fetchVslReport } from "../adapters/apps-script.adapter.server";
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
export async function reportApi(request: Request) {
  try {
    const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
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
