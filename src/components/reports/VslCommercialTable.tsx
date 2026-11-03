import { type DateRange } from "@/lib/vsl-date-range";
import { commercialGlobalPeriod } from "@/lib/vsl-commercial-period";
import { useQueries } from "@tanstack/react-query";
import {
  commercialSchema,
  visibleCommercialRows,
  commercialCash,
  commercialConversion,
} from "@/lib/vsl-commercial";
const MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];
export function VslCommercialTable({
  range,
  refreshKey = "",
}: {
  range?: DateRange | undefined;
  refreshKey?: string;
}) {
  const { months, error } = commercialGlobalPeriod(range);
  const queries = useQueries({
    queries: months.map((month) => ({
      queryKey: ["vsl-commercial", month, "global-period-v3", refreshKey],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await fetch(
          "/api/reports/vsl-commercial?" + new URLSearchParams({ month }),
          { signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]), cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo consultar el mes.");
        const report = commercialSchema.parse(body);
        if (report.month !== month)
          throw new Error("El mes recibido no coincide con el solicitado.");
        return report;
      },
      retry: false,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });
  const busy = queries.some((query) => query.isFetching);
  return (
    <section
      aria-label="Tabla 4: reporte comercial"
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-card"
    >
      <header className="bg-zinc-700 p-4 text-white">
        <h2 className="text-center text-base font-bold">
          TABLA 4: REPORTE COMERCIAL DEL EMBUDO VSL (LIG, ORGÁNICO, GIRA, OEI, TRÁFICO PAGADO) POR
          MES Y CASH COLLECTED
        </h2>
      </header>
      {(error || busy || queries.some((query) => query.isError)) && (
        <div className="space-y-3 p-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && (
            <p role="status" className="text-sm text-muted-foreground">
              Consultando los períodos seleccionados…
            </p>
          )}
          {queries.map((query, i) =>
            query.isError ? (
              <p key={months[i]} role="alert" className="text-sm text-destructive">
                {months[i]}: {query.error.message}
              </p>
            ) : null,
          )}
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[1800px] border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-zinc-700 text-white">
            <tr>
              <th rowSpan={2} className="border border-zinc-500 p-3">
                MES
              </th>
              <th rowSpan={2} className="border border-zinc-500 p-3">
                CLOSER
              </th>
              <th colSpan={4} className="border border-zinc-500 p-3">
                EQUIPO MILLONARIO
              </th>
              <th colSpan={4} className="border border-zinc-500 p-3">
                CÍRCULO MILLONARIO
              </th>
              <th rowSpan={2} className="border border-zinc-500 p-3">
                TOTAL CASH
              </th>
            </tr>
            <tr>
              {["equipo", "circulo"].flatMap((group) =>
                [
                  "ASISTENCIAS",
                  "VENTAS",
                  "% CONVERSIÓN DE VENTA",
                  "CASH COLLECTED POR CLOSER (1RA CUOTA)",
                ].map((label) => (
                  <th key={group + label} className="border border-zinc-500 p-3">
                    {label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {queries.map((query, i) => {
              if (!query.data || query.isError) return null;
              const rows = visibleCommercialRows(query.data);
              const month = months[i]!;
              const label = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
              if (!rows.length) return null;
              return rows.map((row, index) => {
                const equipo = row.equipo;
                const circulo = row.circulo;
                return (
                  <tr
                    key={month + row.id}
                    className={index === 0 ? "border-t-2 border-zinc-400" : ""}
                  >
                    {index === 0 && (
                      <td
                        rowSpan={rows.length}
                        className="border border-border p-3 text-center align-middle font-semibold"
                      >
                        {label}
                      </td>
                    )}
                    <td className="border border-border p-3 text-left">{row.closer}</td>
                    {[equipo, circulo].flatMap((metric, j) =>
                      [
                        metric?.asistencias ?? "—",
                        metric?.ventas ?? "—",
                        commercialConversion(metric),
                        commercialCash([metric]),
                      ].map((value, k) => (
                        <td
                          key={`${j}-${k}`}
                          className="border border-border p-3 text-right tabular-nums"
                        >
                          {value}
                        </td>
                      )),
                    )}
                    <td className="border border-border p-3 text-right font-semibold tabular-nums">
                      {commercialCash([equipo, circulo])}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
