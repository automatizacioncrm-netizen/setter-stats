import { z } from "zod";
export const consultantMonths = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
] as const;
const hours = z.number().finite().nonnegative();
const entrepreneurSchema = z.object({
  NOMBRE: z.string(),
  Enero: hours,
  Febrero: hours,
  Marzo: hours,
  Abril: hours,
  Mayo: hours,
  Junio: hours,
  Julio: hours,
  Agosto: hours,
  Septiembre: hours,
  Octubre: hours,
  Noviembre: hours,
  TOTAL: hours,
});
export const consultantsSchema = z.object({
  success: z.literal(true),
  porArea: z.array(
    z.object({
      MES: z.string(),
      RRHH: hours,
      MKTG: hours,
      FINANZAS: hours,
      "COMERCIAL/EMPRESARIAL": hours,
    }),
  ),
  porEmpresario: z.array(entrepreneurSchema),
});
export type ConsultantsReport = z.infer<typeof consultantsSchema>;
