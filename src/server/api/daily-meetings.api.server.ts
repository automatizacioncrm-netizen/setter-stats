import { z } from "zod";
import { isValidReportRange } from "../../lib/report-filter-state";
import { fetchDailyMeetingsReport } from "../adapters/apps-script.adapter.server";
import { ApiError, apiError } from "../config/env.server";

const date = z.string().refine((value) => isValidReportRange({ dateFrom: value, dateTo: value }));
const count = z.number().finite().int().nonnegative();
const pipelineSchema = z.enum(["all", "vsl", "oei", "lig", "organico", "gira"]);
const counts = z.object({
  totalCitas: count,
  confirmados: count,
  cancelados: count,
  asistidos: count,
  noAsistidos: count,
  sinEstado: count,
  porcentajeAsistencia: z.number().finite().min(0).max(100).nullable().optional(),
});
const detail = z
  .object({
    appointmentId: z.string().trim().min(1),
    opportunityId: z.string(),
    nombreContacto: z.string(),
    telefono: z.string(),
    correo: z.string(),
    pipeline: z.string(),
    embudo: z.string(),
    calendario: z.string(),
    setter: z.string(),
    agendadorCita: z.string(),
    closer: z.string(),
    estado: z.string(),
    fechaReunion: date,
    fechaCreacionCita: date,
    fase: z.string(),
  })
  .passthrough();
const schema = z.object({
  ok: z.literal(true),
  data: z
    .object({
      criterioFecha: z.literal("meetingDate"),
      unidad: z.literal("appointmentId"),
      alcance: z.enum(["todos_los_embudos_permitidos", "embudo_seleccionado"]),
      pipeline: pipelineSchema,
      dateFrom: date,
      dateTo: date,
      porDia: z.array(counts.extend({ fechaReunion: date, detalles: z.array(detail) })),
      total: counts,
      diasConCitas: count,
    })
    .passthrough(),
});
export async function dailyMeetingsApi(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const pipeline = pipelineSchema.safeParse(params.get("pipeline") ?? "all");
    if (!pipeline.success) throw new ApiError("El embudo solicitado no es válido.", 400);
    const calendar = z
      .string()
      .max(300)
      .safeParse(params.get("calendar") ?? "");
    if (!calendar.success) throw new ApiError("El calendario solicitado no es válido.", 400);
    const range = {
      pipeline: pipeline.data,
      dateFrom: params.get("dateFrom") ?? "",
      dateTo: params.get("dateTo") ?? "",
      calendar: calendar.data,
    };
    if (!isValidReportRange(range)) throw new ApiError("El rango de fechas no es válido.", 400);
    const parsed = schema.safeParse(await fetchDailyMeetingsReport(range));
    if (!parsed.success)
      throw new ApiError(
        "La API entregó un reporte diario de reuniones incompleto o incompatible.",
      );
    const data = parsed.data.data;
    if (
      data.pipeline !== range.pipeline ||
      data.alcance !==
        (range.pipeline === "all" ? "todos_los_embudos_permitidos" : "embudo_seleccionado")
    )
      throw new ApiError("El embudo o alcance recibido de reuniones no corresponde al solicitado.");
    if (data.dateFrom !== range.dateFrom || data.dateTo !== range.dateTo)
      throw new ApiError("El rango recibido de reuniones no corresponde al solicitado.");
    const warnings: string[] = [],
      ids = new Set<string>(),
      days = new Set<string>();
    const checkCounts = (row: z.infer<typeof counts>, label: string) => {
      if (
        row.totalCitas !==
        row.confirmados + row.cancelados + row.asistidos + row.noAsistidos + row.sinEstado
      )
        warnings.push(`Los estados no concilian con el total oficial de ${label}.`);
    };
    for (const day of data.porDia) {
      if (
        !day.fechaReunion ||
        days.has(day.fechaReunion) ||
        (range.dateFrom && day.fechaReunion < range.dateFrom) ||
        (range.dateTo && day.fechaReunion > range.dateTo)
      )
        throw new ApiError(
          "La API entregó fechas de reunión repetidas o fuera del rango solicitado.",
        );
      days.add(day.fechaReunion);
      checkCounts(day, day.fechaReunion);
      if (day.detalles.length !== day.totalCitas)
        warnings.push(
          `El detalle de ${day.fechaReunion} contiene ${day.detalles.length} citas para un total oficial de ${day.totalCitas}.`,
        );
      for (const row of day.detalles) {
        if (ids.has(row.appointmentId))
          throw new ApiError("El reporte diario contiene Appointment ID duplicados.");
        ids.add(row.appointmentId);
        if (row.fechaReunion !== day.fechaReunion)
          throw new ApiError("El detalle contiene citas de otra fecha de reunión.");
      }
    }
    checkCounts(data.total, "TOTAL GENERAL");
    for (const key of [
      "totalCitas",
      "confirmados",
      "cancelados",
      "asistidos",
      "noAsistidos",
      "sinEstado",
    ] as const)
      if (data.porDia.reduce((sum, day) => sum + day[key], 0) !== data.total[key])
        warnings.push(`El total oficial de ${key} no concilia con la suma de los días.`);
    if (warnings.length) console.warn("[daily_meetings_report]", { ...range, warnings });
    return Response.json(
      {
        ...data,
        porDia: [...data.porDia].sort((a, b) => a.fechaReunion.localeCompare(b.fechaReunion)),
        warnings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
