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
const amount = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => (value == null || value === "" ? 0 : Number(value)))
  .pipe(z.number().finite());
const schema = z.object({
  productSummary: z
    .array(
      z.object({
        producto: text,
        cantidad: count,
        moneda: text,
        ticket: amount,
        valorVenta: amount,
        cashRecaudado: amount,
        porcentajeRecaudado: amount,
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
  salesValueByCurrency: z
    .array(
      z.object({
        currency: text,
        salesValue: amount,
        cashCollected: amount,
        collectedRate: amount,
      }),
    )
    .nullish(),
  cashByCurrency: z
    .array(z.object({ currency: text, amount }))
    .nullish()
    .transform((value) => value ?? []),
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
        productoEvento: text,
        moneda: text,
        montoUltimoPago: amount,
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
  const close = (a: number, b: number) => Number.isFinite(b) && Math.abs(a - b) <= 0.011;
  const rate = (cash: number, value: number) => (value === 0 ? 0 : (cash / value) * 100);
  for (const product of sales.productSummary) {
    if (
      !close(product.valorVenta, product.cantidad * product.ticket) ||
      !close(product.porcentajeRecaudado, rate(product.cashRecaudado, product.valorVenta))
    )
      throw new ApiError(
        "El resumen de recaudación de Apps Script contiene valores o porcentajes inconsistentes.",
      );
  }
  for (const currency of sales.salesValueByCurrency ?? []) {
    if (!close(currency.collectedRate, rate(currency.cashCollected, currency.salesValue)))
      throw new ApiError(
        "El porcentaje recaudado por moneda de Apps Script no coincide con sus importes.",
      );
  }
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
    productSummary: sales.productSummary,
    salesValueByCurrency: sales.salesValueByCurrency ?? [],
    cashByCurrency:
      sales.salesValueByCurrency != null
        ? sales.salesValueByCurrency.map((item) => ({
            currency: item.currency,
            amount: item.cashCollected,
          }))
        : sales.cashByCurrency,
  };
}
