import type { ConversionMensualProducto, Pipeline } from "../types/reports";

/** Preserve absence separately from an explicitly empty API collection. */
export function readMonthlyConversion(value: unknown): ConversionMensualProducto[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: ConversionMensualProducto[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const row = item as Partial<ConversionMensualProducto>;
    if (
      typeof row.mes !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.mes) ||
      typeof row.embudo !== "string" ||
      typeof row.producto !== "string" ||
      typeof row.citasAsistidas !== "number" ||
      !Number.isFinite(row.citasAsistidas) ||
      row.citasAsistidas < 0 ||
      typeof row.ventas !== "number" ||
      !Number.isFinite(row.ventas) ||
      row.ventas < 0
    )
      return undefined;
    rows.push({
      mes: row.mes,
      embudo: row.embudo,
      embudoNombre: typeof row.embudoNombre === "string" ? row.embudoNombre : "",
      producto: row.producto,
      closer:
        typeof row.closer === "string" && row.closer.trim()
          ? row.closer.trim()
          : "Sin closer identificado",
      citasAsistidas: row.citasAsistidas,
      ventas: row.ventas,
      porcentajeConversion:
        typeof row.porcentajeConversion === "number" && Number.isFinite(row.porcentajeConversion)
          ? row.porcentajeConversion
          : null,
    });
  }
  return rows;
}

export function groupMonthlyConversion(rows: ConversionMensualProducto[], pipeline: Pipeline) {
  const groups = new Map<string, ConversionMensualProducto[]>();
  for (const row of rows
    .filter((row) => row.embudo === pipeline)
    .sort(
      (a, b) =>
        a.mes.localeCompare(b.mes) ||
        a.closer.localeCompare(b.closer, "es") ||
        a.producto.localeCompare(b.producto, "es"),
    )) {
    const group = groups.get(row.mes) ?? [];
    group.push(row);
    groups.set(row.mes, group);
  }
  return [...groups.entries()];
}

export function formatConversionMonth(month: string, includeYear: boolean) {
  const [year, number] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es", {
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, number! - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMonthlyConversion(row: ConversionMensualProducto) {
  if (row.citasAsistidas === 0) return "N/D";
  const value = row.porcentajeConversion ?? (row.ventas / row.citasAsistidas) * 100;
  return Number.isFinite(value) ? `${value.toFixed(2)} %` : "N/D";
}

export const COMPARISON_PRODUCTS = ["Equipo Millonario", "Círculo Millonario"] as const;
export const COMPARISON_CLOSERS = [
  { name: "Amaranta Alfonso Krasnova", label: "AMARANTA" },
  { name: "Ezequiel Dario", label: "EZEQUIEL" },
  { name: "Fiorela Bernales", label: "FIORELA" },
] as const;

export interface ConversionTotals {
  citasAsistidas: number;
  ventas: number;
}

const identity = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();

/** Input aggregates are deduplicated by IDs in Apps Script; never mix all with its funnels. */
export function buildMonthlyConversionMatrix(
  rows: ConversionMensualProducto[],
  pipeline: Pipeline,
  now: Date = new Date(),
) {
  const currentMonth = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "America/Lima",
  }).formatToParts(now);
  const lastMonth = `${currentMonth.find((part) => part.type === "year")!.value}-${currentMonth.find((part) => part.type === "month")!.value}`;
  const buckets = new Map<string, { mes: string; sources: Map<string, ConversionTotals> }>();
  for (const row of rows) {
    if (row.mes < "2026-07" || row.mes > lastMonth) continue;
    if (pipeline !== "all" && row.embudo !== pipeline) continue;
    const closer = COMPARISON_CLOSERS.find((item) => identity(item.name) === identity(row.closer));
    const producto = COMPARISON_PRODUCTS.find((item) => identity(item) === identity(row.producto));
    if (!closer || !producto) continue;
    const key = JSON.stringify([row.mes, closer.name, producto]);
    const bucket = buckets.get(key) ?? {
      mes: row.mes,
      sources: new Map<string, ConversionTotals>(),
    };
    const previous = bucket.sources.get(row.embudo);
    // Repeated aggregates are not extra activity; conflicting counts cannot be reconciled.
    if (
      previous &&
      (previous.citasAsistidas !== row.citasAsistidas || previous.ventas !== row.ventas)
    )
      return undefined;
    bucket.sources.set(row.embudo, { citasAsistidas: row.citasAsistidas, ventas: row.ventas });
    buckets.set(key, bucket);
  }
  const totals = new Map<string, ConversionTotals>();
  const months = new Set<string>();
  for (const [key, bucket] of buckets) {
    const consolidated = pipeline === "all" ? bucket.sources.get("all") : undefined;
    const value =
      consolidated ??
      [...bucket.sources.values()].reduce(
        (sum, item) => ({
          citasAsistidas: sum.citasAsistidas + item.citasAsistidas,
          ventas: sum.ventas + item.ventas,
        }),
        { citasAsistidas: 0, ventas: 0 },
      );
    totals.set(key, value);
    if (value.citasAsistidas > 0 || value.ventas > 0) months.add(bucket.mes);
  }
  return [...months]
    .sort((a, b) => a.localeCompare(b))
    .map((mes) => ({
      mes,
      closers: COMPARISON_CLOSERS.map((closer) => ({
        ...closer,
        products: COMPARISON_PRODUCTS.map((producto) => ({
          producto,
          ...(totals.get(JSON.stringify([mes, closer.name, producto])) ?? {
            citasAsistidas: 0,
            ventas: 0,
          }),
        })),
      })),
    }));
}

export function formatMatrixConversion(totals: ConversionTotals) {
  if (totals.citasAsistidas === 0) return totals.ventas === 0 ? "0.00 %" : "N/D";
  return `${((totals.ventas / totals.citasAsistidas) * 100).toFixed(2)} %`;
}
