import { limaDay } from "@/lib/vsl-date-range";
import {
  initialCommercialPeriod,
  historicalCommercialMonths,
  selectedCommercialMonths,
} from "@/lib/vsl-commercial-period";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  commercialSchema,
  ALLOWED_CLOSERS,
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
export function VslCommercialTable({ refreshKey = "" }: { refreshKey?: string }) {
  const [today, setToday] = useState(() => limaDay());
  const [draft, setDraft] = useState(() => initialCommercialPeriod(today));
  const [range, setRange] = useState(() => initialCommercialPeriod(today));
  const [automatic, setAutomatic] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [closer, setCloser] = useState("all");
  const [product, setProduct] = useState("all");
  const months = automatic
    ? historicalCommercialMonths(today)
    : selectedCommercialMonths(range, today);
  const queries = useQueries({
    queries: months.map((month) => ({
      queryKey: ["vsl-commercial", month, "sales-only-v2", refreshKey, revision],
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
        <p
          className="text-right text-sm font-bold text-green-300"
          title="Etiqueta visual; no certifica los resultados"
        >
          APROBADO
        </p>
        <h2 className="text-center text-base font-bold">
          TABLA 4: REPORTE COMERCIAL DEL EMBUDO VSL (LIG, ORGÁNICO, GIRA, OEI, TRÁFICO PAGADO) POR
          MES Y CASH COLLECTED
        </h2>
      </header>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Filtros exclusivos de la Tabla 4. Cash collected de primera cuota, con monedas separadas.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              selectedCommercialMonths(draft, limaDay());
            } catch (error) {
              setError(error instanceof Error ? error.message : "Período inválido.");
              return;
            }
            setToday(limaDay());
            setAutomatic(false);
            setError("");
            setRange({ ...draft });
            setCloser("all");
          }}
        >
          <label className="min-w-0 max-w-full text-sm">
            Año
            <input
              aria-label="Año comercial"
              className="mt-1 block w-24 rounded border border-border px-3 py-2"
              type="number"
              min="2000"
              max={Number(today.slice(0, 4))}
              required
              value={draft.year}
              onChange={(e) => setDraft({ ...draft, year: e.target.value })}
            />
          </label>
          {(["start", "end"] as const).map((field) => (
            <label key={field} className="min-w-0 max-w-full text-sm">
              {field === "start" ? "Desde" : "Hasta"}
              <select
                className="mt-1 block rounded border border-border px-3 py-2"
                value={draft[field]}
                onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              >
                {MONTHS.map((name, i) => (
                  <option
                    key={name}
                    value={i + 1}
                    disabled={
                      Number(draft.year) > Number(today.slice(0, 4)) ||
                      (draft.year === today.slice(0, 4) && i + 1 > Number(today.slice(5, 7)))
                    }
                  >
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            disabled={busy}
            className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            Aplicar período
          </button>
          <label className="min-w-0 max-w-full text-sm">
            Closer
            <select
              className="mt-1 block max-w-full rounded border border-border px-3 py-2"
              value={closer}
              onChange={(e) => setCloser(e.target.value)}
            >
              <option value="all">Todos</option>
              {ALLOWED_CLOSERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 max-w-full text-sm">
            Producto
            <select
              className="mt-1 block rounded border border-border px-3 py-2"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            >
              <option value="all">Ambos</option>
              <option value="equipo">Equipo Millonario</option>
              <option value="circulo">Círculo Millonario</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const day = limaDay();
              setToday(day);
              if (automatic) setDraft(initialCommercialPeriod(day));
              setRevision((value) => value + 1);
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Cargando…" : "Actualizar tabla 4"}
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          {automatic
            ? `Histórico desde 01/07/2026 hasta ${today} (America/Lima).`
            : "Período manual aplicado."}
        </p>
        {months.includes(today.slice(0, 7)) && (
          <p className="text-xs text-muted-foreground">
            El mes actual contiene los agregados mensuales disponibles. Para garantizar un corte
            exacto al día de hoy, la API debe admitir una fecha final; esta respuesta no permite
            identificar registros futuros.
          </p>
        )}
        {queries.some((query) => query.dataUpdatedAt > 0) && (
          <p className="text-xs text-muted-foreground">
            Última consulta:{" "}
            {new Date(Math.max(...queries.map((query) => query.dataUpdatedAt))).toLocaleString(
              "es-PE",
              { timeZone: "America/Lima" },
            )}{" "}
            (America/Lima)
          </p>
        )}
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
              const rows = visibleCommercialRows(query.data, closer);
              const month = months[i]!;
              const label = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
              if (!rows.length) return null;
              return rows.map((row, index) => {
                const equipo = product === "circulo" ? undefined : row.equipo;
                const circulo = product === "equipo" ? undefined : row.circulo;
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
      <div className="space-y-2 p-4 text-xs text-muted-foreground">
        {queries.map((query, i) =>
          query.data ? (
            <details key={months[i]}>
              <summary>
                Diagnóstico {months[i]} ·{" "}
                {query.data.generatedAt
                  ? new Date(query.data.generatedAt).toLocaleString("es-PE", {
                      timeZone: query.data.timeZone,
                    })
                  : "Sin fecha del servidor"}
              </summary>
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(query.data.diagnostics ?? {}, null, 2)}
              </pre>
            </details>
          ) : null,
        )}
      </div>
    </section>
  );
}
