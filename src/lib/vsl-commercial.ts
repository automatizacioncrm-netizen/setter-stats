import { z } from "zod";
const count = z.number().finite().int().nonnegative();
export const ALLOWED_PRODUCTS = ["EQUIPO MILLONARIO", "CIRCULO MILLONARIO"] as const;
export type AllowedProduct = (typeof ALLOWED_PRODUCTS)[number];
export function isAllowedProduct(product: string): product is AllowedProduct {
  return ALLOWED_PRODUCTS.includes(product as AllowedProduct);
}
export const ALLOWED_CLOSERS = [
  "Amaranta Alfonso Krasnova",
  "Ezequiel Dario",
  "Fiorela Bernales",
  "Gabriel Eduardo Mora De Hoyos",
  "Sebastian",
  "Daniela",
] as const;
const normalizeCloser = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
export function canonicalCloser(name: string) {
  return ALLOWED_CLOSERS.find((closer) => normalizeCloser(closer) === normalizeCloser(name));
}
// Validate common fields on every upstream row, including excluded products.
const commonRowSchema = z.object({
  closer: z.string().trim().min(1),
  closerId: z.string().min(1).optional(),
  product: z.string().min(1),
  agendas: count,
  asistencias: count,
  ventas: count,
  conversion: z.number().finite().nonnegative().nullable(),
  cashPEN: z.number().finite().nonnegative(),
  cashUSD: z.number().finite().nonnegative(),
  cashCollectedUSD: z.number().finite().nonnegative().optional(),
});
const envelopeSchema = z.object({
  success: z.literal(true),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  timeZone: z.string().min(1),
  generatedAt: z.string().optional(),
  rows: z.array(commonRowSchema),
  currency: z.literal("USD").optional(),
  exchangeRate: z
    .object({ penPerUsd: z.number().finite().positive(), description: z.string().min(1) })
    .optional(),
  totals: z
    .object({ cashCollectedUSD: z.number().finite().nonnegative().optional() })
    .passthrough()
    .optional(),
  diagnostics: z.record(z.string(), z.unknown()).optional(),
});
export const commercialSchema = envelopeSchema
  .transform((response) => ({
    ...response,
    rows: response.rows
      .filter((row) => isAllowedProduct(row.product))
      .flatMap((row) => {
        const closer = canonicalCloser(row.closer);
        return closer ? [{ ...row, closer }] : [];
      }),
  }))
  .pipe(
    envelopeSchema.extend({
      rows: z.array(commonRowSchema.extend({ product: z.enum(ALLOWED_PRODUCTS) })),
    }),
  )
  .superRefine((data, ctx) => {
    const keys = new Set<string>();
    for (const [index, row] of data.rows.entries()) {
      const key = JSON.stringify([row.closer, row.product]);
      if (keys.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["rows", index],
          message: "Closer/producto duplicado; no se suman registros ambiguos.",
        });
      keys.add(key);
    }
  });
export type CommercialReport = z.infer<typeof commercialSchema>;
export type CommercialMetric = CommercialReport["rows"][number];
export function pivotCommercial(report: CommercialReport) {
  return ALLOWED_CLOSERS.map((closer) => {
    const rows = report.rows.filter(
      (row) => canonicalCloser(row.closer) === closer && isAllowedProduct(row.product),
    );
    return {
      id: closer,
      closer,
      equipo: rows.find((row) => row.product === "EQUIPO MILLONARIO"),
      circulo: rows.find((row) => row.product === "CIRCULO MILLONARIO"),
    };
  });
}
export function visibleCommercialRows(report: CommercialReport, closer = "all") {
  return pivotCommercial(report).filter(
    (row) =>
      (closer === "all" || row.id === closer) &&
      (row.equipo?.ventas ?? 0) + (row.circulo?.ventas ?? 0) > 0,
  );
}
export function commercialConversion(metric?: CommercialMetric) {
  if (!metric) return "—";
  if (!metric.asistencias) return metric.ventas ? "N/D" : "0.00%";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(metric.ventas / metric.asistencias);
}
// Sum only the API's unified USD amounts; never convert the source currencies here.
export function commercialCash(metrics: (CommercialMetric | undefined)[]) {
  const actual = metrics.filter((m): m is CommercialMetric => !!m);
  if (!actual.length || actual.some((metric) => metric.cashCollectedUSD === undefined)) return "—";
  return formatCommercialUSD(actual.reduce((sum, metric) => sum + metric.cashCollectedUSD!, 0));
}
export function formatCommercialUSD(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
export function commercialCashDetail(metrics: (CommercialMetric | undefined)[]) {
  return metrics
    .filter((metric): metric is CommercialMetric => !!metric)
    .map(
      (metric) =>
        metric.product +
        ": PEN " +
        metric.cashPEN.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
        " · USD " +
        metric.cashUSD.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
    )
    .join("; ");
}
