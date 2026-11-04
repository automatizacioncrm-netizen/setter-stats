import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import {
  commercialTrendsSchema,
  selectTrendSource,
  trendFailureKind,
  trendChartData,
  trendMonths,
  type CommercialTrends,
} from "@/lib/commercial-trends";
import { ALLOWED_PRODUCTS, type CommercialReport } from "@/lib/vsl-commercial";
import { fetchVslReportJson } from "@/lib/vsl-report-request";
const percent = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const DISPLAY_CLOSERS = [
  { name: "Amaranta Alfonso Krasnova", label: "AMARANTA", color: "#4285F4" },
  { name: "Ezequiel Dario", label: "EZEQUIEL", color: "#EA4335" },
  { name: "Fiorela Bernales", label: "FIORELLA", color: "#F9AB00" },
] as const;

type ChartPoint = ReturnType<typeof trendChartData>[number];
export function ConversionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="max-w-sm rounded-lg border border-border bg-white p-3 text-xs shadow-card">
      <p className="mb-2 font-semibold">
        {point.label} {point.month.slice(0, 4)}
      </p>
      {Object.entries(point.metrics).map(([closer, row]) => (
        <p key={closer} className="mb-1">
          <strong>{closer}</strong>: {row.asistencias} asistencias · {row.ventas} ventas ·{" "}
          {row.conversion === null ? "N/D" : percent(row.conversion)}
        </p>
      ))}
    </div>
  );
}
export function CommercialTrendsCharts({
  months,
  reports,
  loadingMonthly,
  monthlyErrors,
  rangeError,
  refreshKey,
  retryMonthly,
}: {
  months: string[];
  reports: (CommercialReport | undefined)[];
  loadingMonthly: boolean;
  monthlyErrors: boolean;
  rangeError?: string | undefined;
  refreshKey: string;
  retryMonthly?: () => void;
}) {
  const from = months.at(-1) ?? "",
    to = months[0] ?? "";
  let endpointRangeError: string | undefined;
  if (months.length)
    try {
      trendMonths(from, to);
    } catch (error) {
      endpointRangeError = error instanceof Error ? error.message : "Rango inválido";
    }
  const query = useQuery({
    queryKey: ["vsl-commercial-trends", from, to, refreshKey, "monthly-fallback-v2"],
    enabled: months.length > 0 && !rangeError && !endpointRangeError,
    queryFn: async ({ signal }) => {
      const raw = await fetchVslReportJson(
        "/api/reports/commercial-trends?" + new URLSearchParams({ from, to }),
        signal,
      );
      const result = commercialTrendsSchema.parse(raw);
      if (result.from !== from || result.to !== to)
        throw new Error("Las tendencias no corresponden al período seleccionado.");
      return result;
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error)
      console.warn("[commercial-trends]", {
        kind: trendFailureKind(query.error),
        message: query.error.message,
        fallback: "commercial-monthly-cache",
      });
  }, [query.error]);
  let selection: ReturnType<typeof selectTrendSource> = {
    data: undefined,
    source: undefined,
    primaryIssue: undefined,
  };
  let fallbackError: string | undefined;
  try {
    selection = selectTrendSource(
      query.data,
      reports.filter((report): report is CommercialReport => !!report),
      months,
    );
  } catch (error) {
    fallbackError = error instanceof Error ? error.message : "Respaldo mensual inválido.";
  }
  const data = selection.data;
  const failedBoth =
    !data &&
    !query.isFetching &&
    !loadingMonthly &&
    (query.isError || !!endpointRangeError || monthlyErrors || !!fallbackError);
  const error =
    rangeError ??
    (failedBoth
      ? "No se pudieron cargar las fuentes de los gráficos. " +
        (query.error
          ? "Tendencias (" + trendFailureKind(query.error) + "): " + query.error.message + ". "
          : (endpointRangeError ?? "")) +
        (fallbackError ??
          (monthlyErrors
            ? "El reporte mensual tampoco pudo cargarse."
            : "No hay un respaldo mensual válido."))
      : undefined);
  const partial = selection.source === "monthly" && reports.filter(Boolean).length < months.length;
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      {ALLOWED_PRODUCTS.map((product) => (
        <section
          key={product}
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-card"
        >
          <h2 className="px-4 pb-2 pt-5 text-center text-base font-semibold text-foreground">
            % Conversión por mes y por closer - {product === "CIRCULO MILLONARIO" ? "CM" : "EM"}
          </h2>
          {error ? (
            <div role="alert" className="space-y-2 p-4 text-sm text-destructive">
              <p>{error}</p>
              <button
                disabled={query.isFetching || loadingMonthly}
                onClick={() => {
                  if (!endpointRangeError) void query.refetch({ cancelRefetch: false });
                  retryMonthly?.();
                }}
                className="rounded border border-border px-3 py-2 disabled:opacity-50"
              >
                Reintentar gráficos
              </button>
            </div>
          ) : data ? (
            <>
              {partial && (
                <p role="status" className="px-3 pt-2 text-xs text-amber-700">
                  Algunos meses aún no están disponibles; no se representan como 0%.
                </p>
              )}
              <ProductTrendChart data={data} product={product} />
              <p className="px-3 pb-3 text-xs text-muted-foreground">
                {selection.source === "monthly"
                  ? "Datos del reporte comercial mensual de la Tabla 4."
                  : "Datos del reporte de tendencias comerciales."}
              </p>
            </>
          ) : months.length > 0 ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              Cargando tendencias y datos comerciales…
            </p>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Sin datos para el período seleccionado.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
export function ProductTrendChart({ data, product }: { data: CommercialTrends; product: string }) {
  // Filter only chart presentation, preserving API records and Table 4.
  const displayed = {
    ...data,
    series: data.series.filter(
      (row) =>
        row.product === product && DISPLAY_CLOSERS.some((closer) => closer.name === row.closer),
    ),
  };
  if (!displayed.series.length)
    return (
      <p className="p-6 text-sm text-muted-foreground">Sin datos para este producto y período.</p>
    );
  const points = trendChartData(displayed, product);
  return (
    <div className="px-3 pb-3">
      <div
        aria-label="Leyenda"
        className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px]"
      >
        {DISPLAY_CLOSERS.map((closer) => (
          <span key={closer.name} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              style={{ backgroundColor: closer.color }}
              className="h-0.5 w-5"
            />
            {closer.label}
          </span>
        ))}
      </div>
      <div className="h-[380px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={points}
            margin={{ top: 54, right: 36, left: 0, bottom: 12 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#d1d5db" }}
            />
            <YAxis
              tickFormatter={(value) => Math.round(Number(value) * 100) + "%"}
              tick={{ fontSize: 10 }}
              width={48}
              domain={[0, "auto"]}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip filterNull={false} content={<ConversionTooltip />} />
            {DISPLAY_CLOSERS.map((closer, closerIndex) => (
              <Line
                key={closer.name}
                type="linear"
                dataKey={closer.name}
                name={closer.label}
                stroke={closer.color}
                strokeWidth={1.5}
                dot={{ r: 2.5 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              >
                <LabelList
                  content={(props) => {
                    const { x, y, value, index } = props;
                    if (typeof value !== "number" || typeof x !== "number" || typeof y !== "number")
                      return null;
                    const point = points[Number(index)];
                    const nearby = DISPLAY_CLOSERS.slice(0, closerIndex).filter((other) => {
                      const v = point?.metrics[other.name]?.conversion;
                      return typeof v === "number" && Math.abs(v - value) < 0.06;
                    }).length;
                    return (
                      <text
                        x={x}
                        y={y - 10 - nearby * 14}
                        fill={closer.color}
                        textAnchor="middle"
                        fontSize={10}
                      >
                        {percent(value)}
                      </text>
                    );
                  }}
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        N/D: sin asistencias; no se representa como 0%.
      </p>
    </div>
  );
}
