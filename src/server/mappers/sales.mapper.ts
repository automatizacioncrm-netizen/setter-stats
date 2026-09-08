import { z } from "zod";
import { SALES_STAGES, type SalesReport } from "../../types/reports";
import { ApiError } from "../config/env.server";

const count = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => (value == null || value === "" ? 0 : Number(value)))
  .pipe(z.number().int().nonnegative().safe());
const text = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => (value == null ? "" : String(value).replace(/\s+/g, " ").trim()));
const stage = z.enum(SALES_STAGES);
const schema = z.object({
  total: count,
  byStage: z
    .array(z.object({ stage, count }))
    .nullish()
    .transform((value) => value ?? []),
  rows: z
    .array(
      z.object({
        setterAsignado: text,
        closerAsignado: text,
        nombreContacto: text,
        fase: stage,
        fuente: text,
        fechaReunion: text,
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
});

export function mapSalesResponse(raw: unknown): SalesReport {
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success)
    throw new ApiError(
      "Apps Script devolvió ventas con formato inválido. Revisa las fases y cantidades del reporte.",
    );
  const sales = parsed.data;
  const stages = new Map(sales.byStage.map((item) => [item.stage, item.count]));
  if (stages.size !== sales.byStage.length)
    throw new ApiError("Apps Script devolvió fases de venta duplicadas.");
  // Validate the source; never replace its counts with locally calculated values.
  if (
    sales.total !== sales.byStage.reduce((sum, item) => sum + item.count, 0) ||
    sales.total !== sales.rows.length
  ) {
    throw new ApiError(
      "Las ventas de Apps Script no coinciden: total, suma por fases y cantidad de filas deben ser iguales.",
    );
  }
  for (const name of SALES_STAGES) {
    if ((stages.get(name) ?? 0) !== sales.rows.filter((row) => row.fase === name).length) {
      throw new ApiError(
        "El resumen de ventas de Apps Script no coincide con las fases de sus filas.",
      );
    }
  }
  return {
    total: sales.total,
    byStage: SALES_STAGES.map((name) => ({ stage: name, count: stages.get(name) ?? 0 })),
    rows: sales.rows,
  };
}
