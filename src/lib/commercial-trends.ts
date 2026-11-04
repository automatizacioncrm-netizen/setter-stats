import { z } from "zod";
import {
  ALLOWED_CLOSERS,
  canonicalCloser,
  isAllowedProduct,
  type CommercialReport,
} from "./vsl-commercial";
export const normalizeTrendCloser = (name: string) =>
  canonicalCloser(name) ?? name.trim().replace(/\s+/g, " ");
const normalizedProduct = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export function trendMonths(from: string, to: string): string[] {
  if (!monthSchema.safeParse(from).success || !monthSchema.safeParse(to).success || from > to)
    throw new Error("Selecciona meses válidos en orden (YYYY-MM).");
  const start = Number(from.slice(0, 4)) * 12 + Number(from.slice(5)) - 1,
    end = Number(to.slice(0, 4)) * 12 + Number(to.slice(5)) - 1;
  if (end - start + 1 > 12)
    throw new Error("Los gráficos admiten un máximo de 12 meses por consulta.");
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const n = start + i;
    return Math.floor(n / 12) + "-" + String((n % 12) + 1).padStart(2, "0");
  });
}
const metric = z.object({
  month: monthSchema,
  product: z.string().min(1),
  closer: z.string().min(1),
  asistencias: z.number().finite().int().nonnegative(),
  ventas: z.number().finite().int().nonnegative(),
  conversion: z.number().finite().nonnegative().nullable(),
});
export const commercialTrendsSchema = z
  .object({
    success: z.literal(true),
    from: monthSchema,
    to: monthSchema,
    months: z.array(monthSchema),
    series: z.array(metric),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .superRefine((data, ctx) => {
    let expected: string[] = [];
    try {
      expected = trendMonths(data.from, data.to);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Rango inválido",
      });
    }
    if (JSON.stringify(expected) !== JSON.stringify(data.months))
      ctx.addIssue({
        code: "custom",
        path: ["months"],
        message: "Los meses recibidos no corresponden al rango solicitado.",
      });
    const seen = new Set<string>();
    data.series.forEach((row, index) => {
      if (!data.months.includes(row.month))
        ctx.addIssue({
          code: "custom",
          path: ["series", index, "month"],
          message: "Mes fuera del rango.",
        });
      const key = JSON.stringify([
        row.month,
        normalizeTrendCloser(row.closer)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase(),
        normalizedProduct(row.product),
      ]);
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["series", index],
          message: "Closer/producto/mes duplicado.",
        });
      seen.add(key);
      const ratio = row.asistencias ? row.ventas / row.asistencias : null;
      if (
        ratio === null
          ? row.conversion !== null
          : row.conversion === null || Math.abs(row.conversion - ratio) > 1e-8
      )
        ctx.addIssue({
          code: "custom",
          path: ["series", index, "conversion"],
          message:
            "La conversión no corresponde a ventas/asistencias; cero asistencias requiere null.",
        });
    });
  })
  .transform((data) => ({
    ...data,
    series: data.series
      .map((row) => ({
        ...row,
        product: normalizedProduct(row.product),
        closer: normalizeTrendCloser(row.closer),
      }))
      .filter((row) => isAllowedProduct(row.product)),
  }));
export type CommercialTrends = z.infer<typeof commercialTrendsSchema>;
export function reconcileTrends(trends: CommercialTrends, reports: readonly CommercialReport[]) {
  for (const report of reports) {
    const rows = trends.series.filter((row) => row.month === report.month);
    if (rows.filter((row) => canonicalCloser(row.closer)).length !== report.rows.length)
      throw new Error(
        "Los gráficos y la Tabla 4 no coinciden en " +
          report.month +
          ". Actualiza los datos para usar la misma versión.",
      );
    for (const metric of report.rows) {
      const row = rows.find(
        (row) => row.closer === metric.closer && row.product === metric.product,
      );
      if (!row || row.asistencias !== metric.asistencias || row.ventas !== metric.ventas)
        throw new Error(
          "Asistencias o ventas de tendencias no coinciden con la Tabla 4 en " +
            report.month +
            ". Actualiza los datos.",
        );
    }
  }
}
export function trendChartData(trends: CommercialTrends, product: string) {
  return trends.months.map((month) => {
    const metrics = Object.fromEntries(
      trends.series
        .filter((row) => row.month === month && row.product === product)
        .map((row) => [row.closer, row]),
    );
    const points = Object.fromEntries(
      Object.entries(metrics).map(([closer, row]) => [closer, row.conversion]),
    );
    return {
      month,
      label: new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "America/Lima" })
        .format(new Date(month + "-15T12:00:00-05:00"))
        .toUpperCase(),
      metrics,
      ...points,
    };
  });
}

/** Derive from the already validated Table 4 cache; no extra API requests or summation. */
export function trendsFromReports(
  reports: readonly CommercialReport[],
  requestedMonths: readonly string[],
): CommercialTrends {
  const months = [...new Set(requestedMonths)].sort();
  const byMonth = new Map<string, CommercialReport>();
  for (const report of reports) {
    if (!months.includes(report.month)) continue;
    if (byMonth.has(report.month))
      throw new Error("Respuestas comerciales duplicadas para " + report.month);
    byMonth.set(report.month, report);
  }
  const series = months.flatMap((month) =>
    (byMonth.get(month)?.rows ?? []).map((row) => ({
      month,
      product: row.product,
      closer: normalizeTrendCloser(row.closer),
      asistencias: row.asistencias,
      ventas: row.ventas,
      conversion: row.asistencias ? row.ventas / row.asistencias : null,
    })),
  );
  const keys = new Set<string>();
  for (const row of series) {
    const key = JSON.stringify([row.month, row.closer, row.product]);
    if (keys.has(key)) throw new Error("Métrica comercial duplicada para el gráfico.");
    keys.add(key);
  }
  return {
    success: true,
    from: months[0] ?? "",
    to: months.at(-1) ?? "",
    months,
    series,
    generatedAt:
      reports
        .map((r) => r.generatedAt)
        .filter((v): v is string => !!v)
        .sort()
        .at(-1) ?? new Date().toISOString(),
  };
}
export function selectTrendSource(
  primary: CommercialTrends | undefined,
  reports: readonly CommercialReport[],
  months: readonly string[],
) {
  let primaryIssue: string | undefined;
  if (primary)
    try {
      reconcileTrends(primary, reports);
      return { data: primary, source: "trends" as const, primaryIssue };
    } catch (error) {
      primaryIssue = error instanceof Error ? error.message : "Inconsistencia de tendencias.";
    }
  if (reports.length)
    return { data: trendsFromReports(reports, months), source: "monthly" as const, primaryIssue };
  return { data: undefined, source: undefined, primaryIssue };
}
export function trendClosers(data: CommercialTrends, product: string) {
  return [
    ...new Set(data.series.filter((row) => row.product === product).map((row) => row.closer)),
  ].sort((a, b) => a.localeCompare(b, "es"));
}
export function trendCloserColor(closer: string) {
  const known = ALLOWED_CLOSERS.findIndex((name) => name === normalizeTrendCloser(closer));
  const colors = ["#126bb5", "#16a085", "#8e44ad", "#d97706", "#dc4c64", "#475569"];
  if (known >= 0) return colors[known]!;
  let hash = 0;
  for (const letter of normalizeTrendCloser(closer).toLocaleLowerCase("es"))
    hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return "hsl(" + (hash % 360) + ", 65%, 38%)";
}
export function trendFailureKind(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/no tiene habilitadas|acci[oó]n no soportada|INVALID_ACTION/i.test(message))
    return "UNSUPPORTED_ACTION";
  if (error instanceof z.ZodError || /contrato|otro per[ií]odo|formato incompatible/i.test(message))
    return "CONTRACT";
  if (/tiempo de espera|timeout/i.test(message)) return "TIMEOUT";
  if (error instanceof Error && error.name === "AbortError") return "CANCELLED";
  if (/cors/i.test(message)) return "CORS";
  if (/JSON/i.test(message)) return "INVALID_JSON";
  if (/HTTP\s*\d{3}/i.test(message)) return "HTTP";
  return "NETWORK";
}
