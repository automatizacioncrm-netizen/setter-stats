import { z } from "zod";

export const settersReportTitle = "Reporte Diario de Setters por Embudo";
export const embudos = z.enum(["ORGANICO", "VSL", "LIG", "OEI", "GIRA"]);

export const setterMetrics = {
  llamadas: "Llamadas salientes",
  seteosEM: "Seteos EM",
  seteosCM: "Seteos CM",
  seteosSinProducto: "Seteos sin producto",
  agendamientosEM: "Agendamientos EM",
  agendamientosCM: "Agendamientos CM",
  agendamientosTotal: "Total agendamientos",
  callConfirmer: "Call confirmer",
} as const;

const count = z.number().int().nonnegative();
const metrics = z
  .object({
    llamadas: count,
    seteosEM: count,
    seteosCM: count,
    seteosSinProducto: count,
    agendamientosEM: count,
    agendamientosCM: count,
    agendamientosTotal: count,
    callConfirmer: count,
  })
  .partial()
  .passthrough();

export type SetterMetrics = z.infer<typeof metrics>;
export const settersReportSchema = z
  .object({
    ok: z.literal(true),
    totales: metrics,
    porEmbudo: z.array(metrics.extend({ embudo: z.string().optional() })),
    porSetterTotal: z.array(metrics.extend({ setter: z.string().optional() })),
    metas: z
      .object({ llamadasSalientes: count.optional(), agendamientos: count.optional() })
      .passthrough()
      .optional(),
    porSetter: z
      .array(metrics.extend({ setter: z.string().optional(), embudo: z.string().optional() }))
      .optional(),
    avisos: z.object({ seteosRealizadosSinFecha: count.optional() }).passthrough().optional(),
    generadoEn: z.string().optional(),
  })
  .passthrough();
