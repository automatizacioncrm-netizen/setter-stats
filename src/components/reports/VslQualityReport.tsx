import { LoadingModal } from "./LoadingModal";
import { useEffect, useState } from "react";
import { VslDateFilter } from "./VslDateFilter";
import {
  rangeForPreset,
  rangeLabel,
  customRange,
  type DatePreset,
  type DateRange,
} from "@/lib/vsl-date-range";
import { useVslSync } from "@/hooks/use-vsl-sync";
import { syncLabel } from "@/lib/vsl-sync";
import { MonthlySurveyTable } from "./MonthlySurveyTable";
import { isDetailCount, type SurveySelection } from "@/lib/survey-detail";
import { normalizeSurveyMonth } from "@/lib/survey-month";
import { groupSurveyRows } from "@/lib/survey-month";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  qualityReportSchema,
  displayReportCell,
  qualityPercentIndices,
  surveyPercentIndices,
  type QualityReport,
} from "@/lib/vsl-quality";
export function ReportTable({
  title,
  table,
  frozen,
  onDetail,
}: {
  title: string;
  table: QualityReport["quality"];
  frozen: number;
  onDetail?: (selection: SurveySelection, trigger: HTMLElement) => void;
}) {
  const survey = frozen === 2;
  const rows = survey
    ? groupSurveyRows(table.rows)
    : table.rows.map((row) => ({ row, monthLabel: "", monthRowSpan: 1, endOfMonth: false }));
  const visibleColumn = (index: number) => (survey ? index !== 18 : true);
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-card">
      <h2 className="bg-zinc-700 p-4 text-center text-base font-bold text-white">{title}</h2>
      <div className="max-h-[65vh] overflow-auto">
        <table
          className={`w-full border-collapse text-sm ${survey ? "table-fixed" : ""}`}
          style={
            survey
              ? { minWidth: table.columns.filter((_, i) => visibleColumn(i)).length * 160 }
              : undefined
          }
        >
          {survey && (
            <colgroup>
              {table.columns.map((_, i) =>
                visibleColumn(i) ? (
                  <col key={i} style={i < 2 ? { width: 160 } : undefined} />
                ) : null,
              )}
            </colgroup>
          )}
          <thead className="sticky top-0 z-20 bg-white text-black">
            <tr>
              {table.columns.map((c, i) =>
                visibleColumn(i) ? (
                  <th
                    key={i}
                    style={survey && i < 2 ? { left: i * 160 } : undefined}
                    className={`min-w-40 border border-zinc-300 p-3 text-center font-bold ${survey && i < 2 ? "sticky z-30 bg-white" : i === 0 ? "sticky left-0 z-30 bg-white" : ""}`}
                  >
                    {c}
                  </th>
                ) : null,
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, monthLabel, monthRowSpan, endOfMonth }, ri) => (
              <tr
                key={ri}
                className={
                  survey
                    ? endOfMonth
                      ? "border-b-2 border-zinc-400"
                      : ""
                    : ri === 0 || row[0] !== table.rows[ri - 1]?.[0]
                      ? "border-t-2 border-zinc-400"
                      : ""
                }
              >
                {row.map((v, i) =>
                  visibleColumn(i) && !(survey && i === 0 && monthRowSpan === 0) ? (
                    <td
                      key={i}
                      rowSpan={survey && i === 0 ? monthRowSpan : undefined}
                      style={survey && i < 2 ? { left: i * 160 } : undefined}
                      className={`${survey && i === 0 ? "align-middle !text-center border-b-2 border-b-zinc-400" : ""} border border-border p-2 tabular-nums ${i < frozen ? "text-left" : "text-right"} ${survey && i < 2 ? "sticky z-10 bg-background" : ""} ${i === 0 ? "sticky left-0 z-10 bg-background font-semibold" : ""} ${(frozen === 2 ? surveyPercentIndices : qualityPercentIndices).includes(i) ? "bg-brand-soft font-semibold text-brand" : ""}`}
                    >
                      {survey && isDetailCount(v, i) && onDetail ? (
                        <button
                          type="button"
                          className="cursor-pointer rounded px-1 font-medium text-brand underline decoration-brand/40 underline-offset-2 hover:bg-brand-soft focus-visible:outline focus-visible:outline-2"
                          aria-label={[
                            "Ver detalle",
                            displayReportCell(row[0] ?? null, 0, true),
                            row[1],
                            table.columns[i],
                            v,
                          ].join(" · ")}
                          onClick={(event) =>
                            onDetail(
                              {
                                month: normalizeSurveyMonth(row[0]),
                                status: String(row[1]),
                                column: i,
                                label: table.columns[i] ?? "",
                                expected: v,
                              },
                              event.currentTarget,
                            )
                          }
                        >
                          {displayReportCell(v, i, true)}
                        </button>
                      ) : survey && i === 0 ? (
                        monthLabel
                      ) : (
                        displayReportCell(v, i, survey)
                      )}
                    </td>
                  ) : null,
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length === 0 && (
          <p className="p-5 text-muted-foreground">Sin registros para este reporte.</p>
        )}
      </div>
    </section>
  );
}
export function VslQualityReport() {
  const [preset, setPreset] = useState<DatePreset>("all"),
    [customStart, setCustomStart] = useState(""),
    [customEnd, setCustomEnd] = useState(""),
    [filterError, setFilterError] = useState("");
  const [applied, setApplied] = useState<{ preset: DatePreset; range?: DateRange | undefined }>({
      preset: "all",
    }),
    [revision, setRevision] = useState(0);
  const [lastValid, setLastValid] = useState<QualityReport | null>(null);
  const sync = useVslSync(() => {
    setApplied((current) => ({ ...current, range: rangeForPreset(current.preset, current.range) }));
    setRevision((value) => value + 1);
  });
  const selectPreset = (value: DatePreset) => {
    setPreset(value);
    setFilterError("");
    if (value !== "custom") {
      setApplied({ preset: value, range: rangeForPreset(value) });
      setRevision((current) => current + 1);
    }
  };
  const applyCustom = () => {
    try {
      setApplied({ preset: "custom", range: customRange(customStart, customEnd) });
      setRevision((current) => current + 1);
      setFilterError("");
    } catch (error) {
      setFilterError(error instanceof Error ? error.message : "Rango inválido.");
    }
  };
  const query = useQuery({
    queryKey: [
      "vsl-quality-report",
      "date-filter-v4",
      applied.range?.startDate ?? "all",
      applied.range?.endDate ?? "all",
      revision,
    ],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams(applied.range ?? {});
      const response = await fetch("/api/reports/vsl-calidad" + (params.size ? "?" + params : ""), {
        signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el reporte.");
      return qualityReportSchema.parse(body);
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.data) setLastValid(query.data);
  }, [query.data]);
  const data = query.data ?? lastValid;
  const warning = sync.state?.warning;
  return (
    <main className="min-h-screen space-y-6 bg-background p-4 sm:p-8">
      <Link to="/reports" className="text-sm text-brand">
        ← Reportes comerciales
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">VSL | CALIDAD DE LEADS Y ENCUESTAS</h1>
        <button
          disabled={sync.busy || sync.uncertain}
          onClick={() => void sync.start()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {sync.busy ? "Actualización en curso…" : "Actualizar datos"}
        </button>
      </header>
      <VslDateFilter
        preset={preset}
        start={customStart}
        end={customEnd}
        onPreset={selectPreset}
        onStart={setCustomStart}
        onEnd={setCustomEnd}
        onApply={applyCustom}
        onClear={() => selectPreset("all")}
        error={filterError}
        activeRange={applied.range}
      />
      {(sync.state || sync.submitting) && (
        <section
          aria-label="Progreso de sincronización"
          className="space-y-2 rounded-lg border border-border p-4"
        >
          <p role="status">{syncLabel(sync.state)}</p>
          {!!sync.state?.completedStages.length && (
            <p className="text-sm">Etapas confirmadas: {sync.state.completedStages.join(" · ")}</p>
          )}
          {sync.state?.status === "ERROR" && (
            <p role="alert" className="text-destructive">
              {sync.state.error || "Apps Script informó un error de sincronización."}
            </p>
          )}
          {warning && (
            <p role="alert" className="text-sm text-amber-700">
              {Array.isArray(warning) ? warning.join(" · ") : warning}
            </p>
          )}
        </section>
      )}
      {sync.error && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive p-4">
          <p className="text-destructive">{sync.error}</p>
          <button
            disabled={sync.submitting || sync.tracking}
            onClick={() => void sync.resume()}
            className="rounded border px-3 py-2 text-sm"
          >
            Consultar estado
          </button>
        </div>
      )}
      <LoadingModal
        open={query.isFetching}
        title="Cargando datos…"
        description={`Consultando ambas tablas para ${rangeLabel(applied.range)}. Espera un momento.`}
      />
      {query.isError && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-destructive p-4 text-destructive"
        >
          <p>{query.error.message}</p>
          <button
            disabled={query.isFetching}
            onClick={() => void query.refetch({ cancelRefetch: false })}
            className="rounded border px-3 py-2 text-sm"
          >
            Reintentar consulta
          </button>
        </div>
      )}
      {!query.data && data && (
        <p className="text-sm text-amber-700">
          Se conservan los últimos datos válidos de: {rangeLabel(data.filter)}. Aún no corresponden
          al nuevo filtro solicitado.
        </p>
      )}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            Última actualización del servidor:{" "}
            {new Date(data.generatedAt).toLocaleString("es-PE", { timeZone: data.timeZone })}{" "}
            (America/Lima)
          </p>
          {data.queriedAt && (
            <p className="text-sm text-muted-foreground">
              Fecha de consulta:{" "}
              {new Date(data.queriedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}{" "}
              (America/Lima)
            </p>
          )}
          {(data.quality.truncated || data.surveys.truncated || data.surveyStatus.truncated) && (
            <p role="status">El servidor indica que el reporte está truncado.</p>
          )}
          <ReportTable
            title="TABLA 1: ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO VSL | CLOSER"
            table={data.quality}
            frozen={1}
          />
          <MonthlySurveyTable table={data.surveys} statusTable={data.surveyStatus} />
          {(data.diagnostics?.warnings ?? []).map((warning, index) => (
            <p key={index} className="text-sm text-muted-foreground">
              {warning}
            </p>
          ))}
        </>
      )}
    </main>
  );
}
