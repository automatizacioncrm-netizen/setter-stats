import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import {
  ALLOWED_PRODUCTS,
  commercialCloserSchema,
  commercialClosersSchema,
  formatCommercialUSD,
  type CommercialCloserMetric,
  type CommercialCloserReport,
} from "@/lib/vsl-commercial";

async function fetchCommercial(params: Record<string, string>, signal: AbortSignal) {
  const response = await fetch("/api/reports/vsl-commercial?" + new URLSearchParams(params), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(75000)]),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok || body?.success === false)
    throw new Error(body?.error || "No se pudo consultar el reporte por closer.");
  return body;
}

const queryOptions = { staleTime: Infinity, gcTime: Infinity, retry: false } as const;
const monthFormat = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const conversionFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const columns = ["Asistidas", "No asistidas", "Ventas", "% Conversión", "Cash collected (USD)"];

export function monthLabel(month: string) {
  const label = monthFormat.format(new Date(month + "-01T00:00:00Z")).replace(" de ", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function metricValues(metric?: CommercialCloserMetric) {
  if (!metric) return [0, 0, 0, "0.00%", formatCommercialUSD(0)];
  return [
    metric.asistencias,
    metric.noAsistencias,
    metric.ventas,
    metric.conversion === null
      ? metric.ventas
        ? "N/D"
        : "0.00%"
      : conversionFormat.format(metric.conversion),
    formatCommercialUSD(metric.cashCollectedUSD),
  ];
}

function MetricTable({ report }: { report: CommercialCloserReport }) {
  const extraProducts = new Set<string>();
  for (const products of [
    report.totalsByProduct,
    ...report.months.map(({ products }) => products),
  ]) {
    for (const [name, metric] of Object.entries(products)) {
      if (ALLOWED_PRODUCTS.some((product) => product === name)) continue;
      if (
        metric.citasAsignadas ||
        metric.asistencias ||
        metric.noAsistencias ||
        metric.ventas ||
        metric.cashCollectedUSD ||
        metric.conversion
      )
        extraProducts.add(name);
    }
  }

  const groups = [...ALLOWED_PRODUCTS, ...extraProducts].map((product) => ({
    product,
    label: product === "CIRCULO MILLONARIO" ? "CÍRCULO MILLONARIO" : product,
  }));
  const rows = [
    ...report.months.map(({ month, products, total }) => ({
      label: monthLabel(month),
      products,
      total,
      summary: false,
    })),
    { label: "Total", products: report.totalsByProduct, total: report.totals, summary: true },
  ];

  return (
    <div
      role="region"
      aria-label="Comparación mensual por producto"
      tabIndex={0}
      className="max-w-full overflow-x-auto"
    >
      <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-xs tabular-nums">
        <thead className="bg-zinc-700 text-white">
          <tr>
            <th
              rowSpan={2}
              scope="col"
              className="sticky left-0 z-10 border-b border-r border-zinc-500 bg-zinc-700 px-2 py-2"
            >
              Mes
            </th>
            {[...groups, { product: null, label: "TOTAL" }].map(({ product, label }) => (
              <th
                key={product === null ? "total" : "product:" + product}
                colSpan={columns.length}
                scope="colgroup"
                className="border-b border-r border-zinc-500 px-1.5 py-2 last:border-r-0"
              >
                {label}
              </th>
            ))}
          </tr>
          <tr>
            {Array.from({ length: groups.length + 1 }, (_, index) =>
              columns.map((column, columnIndex) => (
                <th
                  key={index + ":" + column}
                  scope="col"
                  className={
                    "border-b border-zinc-500 px-1.5 py-1.5 font-medium " +
                    (columnIndex === columns.length - 1 ? "border-r last:border-r-0" : "")
                  }
                >
                  {column}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, products, total, summary }) => (
            <tr
              key={label}
              className={summary ? "bg-muted font-bold" : "odd:bg-white even:bg-zinc-50"}
            >
              <th
                scope="row"
                className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border bg-inherit px-2 py-2"
              >
                {label}
              </th>
              {[...groups.map(({ product }) => products[product]), total].flatMap((metric, index) =>
                metricValues(metric).map((value, columnIndex) => (
                  <td
                    key={index + ":" + columnIndex}
                    className={
                      "whitespace-nowrap border-b border-border px-1.5 py-2 " +
                      (columnIndex === columns.length - 1 ? "border-r last:border-r-0" : "")
                    }
                  >
                    {value}
                  </td>
                )),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useCommercialClosers() {
  return useQuery({
    ...queryOptions,
    queryKey: ["vsl-commercial-closers"],
    queryFn: async ({ signal }) =>
      commercialClosersSchema.parse(
        await fetchCommercial({ action: "commercial_closers" }, signal),
      ),
  });
}

export function useCommercialCloser(closer: string) {
  return useQuery({
    ...queryOptions,
    queryKey: ["vsl-commercial-closer", closer],
    enabled: closer !== "",
    queryFn: async ({ signal }) =>
      commercialCloserSchema.parse(
        await fetchCommercial({ action: "commercial_closer", closer }, signal),
      ),
  });
}

export function VslCommercialCloser({
  closer,
  report,
  error,
  busy,
  onRetry,
}: {
  closer: string;
  report: CommercialCloserReport | undefined;
  error: Error | null;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="vsl-commercial-closer-heading"
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-card"
    >
      <header className="bg-zinc-700 p-4 text-white">
        <h2
          id="vsl-commercial-closer-heading"
          className="break-words text-center text-base font-bold"
        >
          REPORTE COMERCIAL DE {closer.toUpperCase()} POR MES Y CASH COLLECTED
        </h2>
      </header>
      {busy ? (
        <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Cargando...
        </p>
      ) : error ? (
        <div className="space-y-2 p-4">
          <p role="alert" className="break-words text-sm text-destructive">
            No se pudo cargar el reporte de {closer}. {error.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Reintentar
          </button>
        </div>
      ) : (
        report && <MetricTable report={report} />
      )}
    </section>
  );
}
