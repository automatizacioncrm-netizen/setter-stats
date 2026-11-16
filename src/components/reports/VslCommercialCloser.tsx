import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import {
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

export function monthLabel(month: string) {
  const label = monthFormat.format(new Date(month + "-01T00:00:00Z")).replace(" de ", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const groups = [
  { product: "EQUIPO MILLONARIO", label: "EQUIPO MILLONARIO" },
  { product: "CIRCULO MILLONARIO", label: "CÍRCULO MILLONARIO" },
  { product: null, label: "TOTAL" },
] as const;

const tableSections = [
  {
    title: "ASISTENCIA POR MES",
    columns: ["Asistidas", "No asistidas"],
    minWidth: "min-w-[720px]",
    values: (metric?: CommercialCloserMetric) => [
      metric?.asistencias ?? 0,
      metric?.noAsistencias ?? 0,
    ],
  },
  {
    title: "VENTAS Y CASH COLLECTED POR MES",
    columns: ["Ventas", "% Conversión", "Cash collected (USD)"],
    minWidth: "min-w-[1120px]",
    values: (metric?: CommercialCloserMetric) => [
      metric?.ventas ?? 0,
      metric?.conversion == null
        ? metric?.ventas
          ? "N/D"
          : "0.00%"
        : conversionFormat.format(metric.conversion),
      formatCommercialUSD(metric?.cashCollectedUSD ?? 0),
    ],
  },
] as const;

function MetricTables({ report }: { report: CommercialCloserReport }) {
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
    <div className="min-w-0 space-y-6 p-4">
      {tableSections.map(({ title, columns, minWidth, values }) => (
        <section key={title} className="min-w-0 overflow-hidden rounded-lg border border-border">
          <h3 className="bg-zinc-700 px-4 py-2 text-center text-sm font-bold text-white">
            {title}
          </h3>
          <div role="region" aria-label={title} tabIndex={0} className="max-w-full overflow-x-auto">
            <table
              className={`w-full table-fixed border-separate border-spacing-0 text-sm tabular-nums ${minWidth}`}
            >
              <thead className="bg-zinc-700 text-white">
                <tr>
                  <th
                    rowSpan={2}
                    scope="col"
                    className="sticky left-0 z-10 w-36 border-r border-zinc-500 bg-zinc-700 px-4 py-3"
                  >
                    Mes
                  </th>
                  {groups.map(({ product, label }) => (
                    <th
                      key={label}
                      colSpan={columns.length}
                      scope="colgroup"
                      className={`border-b border-r border-zinc-500 px-4 py-3 last:border-r-0 ${product === null ? "bg-zinc-600" : ""}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {groups.flatMap(({ product, label }) =>
                    columns.map((column) => (
                      <th
                        key={label + column}
                        scope="col"
                        className={`px-4 py-3 font-medium ${product === null ? "bg-zinc-600" : ""}`}
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
                      className="sticky left-0 z-10 border-b border-r border-border bg-inherit px-4 py-3"
                    >
                      {label}
                    </th>
                    {groups.flatMap(({ product, label: groupLabel }) =>
                      values(product === null ? total : products[product]).map((value, index) => (
                        <td
                          key={groupLabel + index}
                          className={`whitespace-nowrap border-b border-border px-4 py-3 ${product === null ? "bg-muted" : ""}`}
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
        </section>
      ))}
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
        report && <MetricTables report={report} />
      )}
    </section>
  );
}
