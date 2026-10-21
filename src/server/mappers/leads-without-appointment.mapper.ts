import { z } from "zod";
import type { LeadsWithoutAppointment } from "../../types/reports";
const count = z.number().int().nonnegative();
const percent = z.number().finite().min(0).max(100).nullable().optional();
const schema = z.object({
  totalLeads: count,
  leadsConCita: count,
  leadsSinCita: count,
  porcentajeSinCita: percent,
  porcentajeConCita: percent,
  detalleSinCita: z
    .array(
      z.object({
        opportunityId: z.string().trim().min(1),
        nombreContacto: z.string(),
        fechaCreacion: z.string(),
        setter: z.string(),
        pipeline: z.enum(["vsl", "oei", "organico", "gira"]),
      }),
    )
    .optional(),
});
export function mapLeadsWithoutAppointment(
  value: unknown,
  expectedPipeline: "vsl" | "oei" | "organico" | "gira" = "vsl",
): {
  data?: LeadsWithoutAppointment;
  error?: string;
} {
  if (value == null)
    return { error: "La API no entrega este indicador para el embudo seleccionado." };
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { error: "La API entregó información incompleta de leads sin cita." };
  const d = parsed.data;
  const detail = d.detalleSinCita;
  if (detail?.some((row) => row.pipeline !== expectedPipeline))
    return { error: "El detalle de leads sin cita contiene otro embudo." };
  if (
    d.leadsConCita + d.leadsSinCita !== d.totalLeads ||
    (detail &&
      (detail.length > d.leadsSinCita ||
        new Set(detail.map((r) => r.opportunityId)).size !== detail.length))
  ) {
    return { error: "Los datos de leads sin cita no concilian con las oportunidades únicas." };
  }
  for (const [value, n] of [
    [d.porcentajeSinCita, d.leadsSinCita],
    [d.porcentajeConCita, d.leadsConCita],
  ] as const) {
    if (
      value != null &&
      (d.totalLeads === 0 || Math.abs(value - (n / d.totalLeads) * 100) > 0.011)
    ) {
      return { error: "Los porcentajes de leads sin cita no concilian con los conteos de la API." };
    }
  }
  return { data: d };
}
