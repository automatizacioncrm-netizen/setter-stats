import { presentMonthlyLeadRows } from "@/lib/monthly-lead-quality";
import { FunnelLeadQualityTable } from "./FunnelLeadQualityTable";
import { isVisibleLeadQualityColumn } from "./lead-quality-columns";
import { fetchVslReportJson } from "@/lib/vsl-report-request";
import { VslCommercialTable } from "./VslCommercialTable";
import {
  monthLabel,
  useCommercialCloser,
  useCommercialClosers,
  VslCommercialCloser,
} from "./VslCommercialCloser";
import { AppointmentsByFunnelTable } from "./AppointmentsByFunnelTable";
import { LoadingModal } from "./LoadingModal";
import { useEffect, useState } from "react";
import { VslDateFilter } from "./VslDateFilter";
import {
  rangeForPreset,
  rangeLabel,
  limaDay,
  type DatePreset,
  type DateRange,
} from "@/lib/vsl-date-range";
import { managementPeriods, managementRange, orderManagementRows } from "@/lib/management-period";
import { useVslSync } from "@/hooks/use-vsl-sync";
import { syncLabel } from "@/lib/vsl-sync";
import { MonthlySurveyTable } from "./MonthlySurveyTable";
import { isDetailCount, type SurveySelection } from "@/lib/survey-detail";
import { normalizeSurveyMonth } from "@/lib/survey-month";
import { groupSurveyRows } from "@/lib/survey-month";
import { useIsFetching, useQuery } from "@tanstack/react-query";
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
  authoritative = false,
}: {
  title: string;
  table: QualityReport["quality"];
  frozen: number;
  onDetail?: (selection: SurveySelection, trigger: HTMLElement) => void;
  authoritative?: boolean;
}) {
  const survey = frozen === 2;
  const monthly = survey
    ? undefined
    : authoritative
      ? { rows: table.rows, error: undefined }
      : presentMonthlyLeadRows(table.rows, "vsl");
  const rows = survey
    ? groupSurveyRows(table.rows)
    : (monthly?.rows ?? []).map((row) => ({
        row,
        monthLabel: "",
        monthRowSpan: 1,
        endOfMonth: false,
      }));
  const visibleColumn = (index: number) =>
    survey ? index !== 18 : isVisibleLeadQualityColumn(table.columns[index] ?? "");
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-card">
      <h2 className="bg-muted/60 p-4 text-center text-base font-bold text-muted-foreground">
        {title}
      </h2>
      {monthly?.error && (
        <p role="alert" className="p-4 text-sm text-destructive">
          {monthly.error}
        </p>
      )}
      <div className="max-h-[65vh] overflow-auto">
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={
            survey
              ? { minWidth: table.columns.filter((_, i) => visibleColumn(i)).length * 160 }
              : {
                  minWidth:
                    160 + (table.columns.filter((_, i) => visibleColumn(i)).length - 1) * 112,
                }
          }
        >
          <colgroup>
            {table.columns.map((_, i) =>
              visibleColumn(i) ? (
                <col
                  key={i}
                  style={
                    survey ? (i < 2 ? { width: 160 } : undefined) : { width: i === 0 ? 160 : 112 }
                  }
                />
              ) : null,
            )}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-white text-black">
            <tr>
              {table.columns.map((c, i) =>
                visibleColumn(i) ? (
                  <th
                    key={i}
                    style={survey && i < 2 ? { left: i * 160 } : undefined}
                    className={`${survey ? "min-w-40 p-3" : "px-1.5 py-2 leading-snug break-words"} border border-zinc-300 text-center font-bold ${survey && i < 2 ? "sticky z-30 bg-white" : i === 0 ? "sticky left-0 z-30 bg-white" : ""}`}
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
                    : ri === 0 || row[0] !== monthly?.rows[ri - 1]?.[0]
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
                      className={`${survey && i === 0 ? "align-middle !text-center border-b-2 border-b-zinc-400" : ""} border border-border ${survey ? "p-2" : "px-1.5 py-2"} tabular-nums ${i < frozen ? "text-left" : "text-right"} ${survey && i < 2 ? "sticky z-10 bg-background" : ""} ${i === 0 ? "sticky left-0 z-10 bg-background font-semibold" : ""} ${(frozen === 2 ? surveyPercentIndices : qualityPercentIndices).includes(i) ? "bg-brand-soft font-semibold text-brand" : ""}`}
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

async function loadManagementReport(signal: AbortSignal, range?: DateRange) {
  const params = new URLSearchParams(range ?? {});
  const body = await fetchVslReportJson(
    "/api/reports/vsl-calidad" + (params.size ? "?" + params : ""),
    signal,
  );
  return qualityReportSchema.parse(body);
}

export function VslQualityReport() {
  const [preset, setPreset] = useState<DatePreset>("all"),
    [customStart, setCustomStart] = useState(""),
    [customEnd, setCustomEnd] = useState(""),
    [filterError, setFilterError] = useState("");
  const [closer, setCloser] = useState("");
  const closerOptions = useCommercialClosers();
  const closerDetail = useCommercialCloser(closer);
  const closerReport = closerDetail.data;
  const closerPeriod = closerReport
    ? `Todo (desde ${monthLabel(closerReport.firstMonth)} hasta ${monthLabel(closerReport.lastMonth)}) · Closer: ${closer}`
    : `Todo · Closer: ${closer}`;
  const [applied, setApplied] = useState<{
      preset: DatePreset;
      range?: DateRange;
      revision: number;
    }>({ preset: "all", revision: 0 }),
    [revision, setRevision] = useState(0);
  const [today, setToday] = useState(limaDay);
  useEffect(() => {
    const updateDay = () => setToday(limaDay());
    const timer = setInterval(updateDay, 30_000);
    window.addEventListener("focus", updateDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", updateDay);
    };
  }, []);
  const now = new Date(today + "T12:00:00-05:00");
  const activeRange = managementRange(applied.preset, applied.range, now);
  const commercialRange = rangeForPreset(applied.preset, applied.range, now);
  const sync = useVslSync(() => setRevision((value) => value + 1));
  const selectPreset = (value: DatePreset) => {
    setPreset(value);
    setFilterError("");
    if (value === "all") void historical.refetch();
    if (value !== "custom") {
      setApplied((current) => ({ preset: value, revision: current.revision + 1 }));
    }
  };
  const applyCustom = () => {
    try {
      const range = { startDate: customStart, endDate: customEnd };
      managementRange("custom", range);
      setApplied((current) => ({ preset: "custom", range, revision: current.revision + 1 }));
      setFilterError("");
    } catch (error) {
      setFilterError(error instanceof Error ? error.message : "Rango inválido.");
    }
  };
  const historical = useQuery({
    queryKey: ["vsl-quality-report", "management-history", today, revision],
    queryFn: async ({ signal }) => {
      const report = await loadManagementReport(signal);
      if (!report.periods || !report.dataThrough)
        throw new Error(
          "Apps Script no informó los períodos y el corte del histórico de Gerencia.",
        );
      const periods = managementPeriods(report.periods, report.dataThrough, today);
      const order = <T extends QualityReport["quality"]>(table: T): T => ({
        ...table,
        rows: orderManagementRows(table.rows, periods),
      });
      return {
        ...report,
        periods,
        quality: order(report.quality),
        qualityOrganico: report.qualityOrganico && order(report.qualityOrganico),
        qualityLIG: report.qualityLIG && order(report.qualityLIG),
        surveys: order(report.surveys),
        surveyStatus: order(report.surveyStatus),
      };
    },
    retry: false,
    staleTime: Infinity,
    placeholderData: (previous) => previous,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const filtered = useQuery({
    queryKey: [
      "vsl-quality-report",
      "management-range",
      activeRange?.startDate,
      activeRange?.endDate,
      revision,
      applied.revision,
    ],
    queryFn: ({ signal }) => loadManagementReport(signal, activeRange),
    enabled: !!activeRange,
    retry: false,
    gcTime: 300000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const query = activeRange ? filtered : historical;
  const data =
    query.isError || query.isFetching || query.isPlaceholderData ? undefined : query.data;
  const metadata = closer ? (query.data ?? historical.data) : data;
  const clearFilters = () => {
    setCloser("");
    setPreset("all");
    setCustomStart("");
    setCustomEnd("");
    setFilterError("");
    setApplied({ preset: "all", revision: 0 });
    if (!historical.data && !historical.isFetching)
      void historical.refetch({ cancelRefetch: false });
  };
  const warning = sync.state?.warning;
  const commercialFetching = useIsFetching({ queryKey: ["vsl-commercial"] }) > 0;
  return (
    <main className="vsl-corporate-report vsl-light-report min-h-screen space-y-6 p-4 sm:p-8">
      <Link to="/reports" className="text-sm text-brand hover:underline">
        ← Reportes comerciales
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">
          VSL | CALIDAD DE LEADS Y ENCUESTAS
        </h1>
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
        onClear={clearFilters}
        error={filterError}
        activeRange={data?.filter ?? activeRange}
        periods={historical.data?.periods ?? []}
        today={today}
        closer={closer}
        closers={closerOptions.data?.closers ?? []}
        onCloser={setCloser}
        closerPeriod={closerPeriod}
        closerStatus={
          closerOptions.error
            ? `No se pudo cargar la lista de closers. ${closerOptions.error.message}`
            : closerOptions.isFetching
              ? "Cargando closers..."
              : undefined
        }
      />
      {(sync.state || sync.submitting) && (
        <section
          aria-label="Progreso de sincronización"
          className="space-y-2 rounded-lg border border-border bg-white p-4"
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
        <div role="alert" className="space-y-2 rounded-lg border border-destructive bg-white p-4">
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
        open={!closer && (query.isFetching || commercialFetching)}
        title="Cargando datos…"
        description={`Consultando los reportes para ${rangeLabel(activeRange)}. Espera un momento.`}
      />
      {!closer && query.isError && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-destructive bg-white p-4 text-destructive"
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
      {metadata && (
        <>
          {(!activeRange || closer) && metadata.dataThrough && (
            <p className="text-sm text-muted-foreground">
              Datos hasta el {metadata.dataThrough.split("-").reverse().join("/")} (Lima)
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Última actualización del servidor:{" "}
            {new Date(metadata.generatedAt).toLocaleString("es-PE", {
              timeZone: metadata.timeZone,
            })}{" "}
            (America/Lima)
          </p>
          {metadata.queriedAt && (
            <p className="text-sm text-muted-foreground">
              Fecha de consulta:{" "}
              {new Date(metadata.queriedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}{" "}
              (America/Lima)
            </p>
          )}
        </>
      )}
      {closer && (
        <VslCommercialCloser
          closer={closer}
          report={closerReport}
          error={closerDetail.error}
          busy={closerDetail.isFetching}
          onRetry={() => void closerDetail.refetch({ cancelRefetch: false })}
        />
      )}
      {!closer && data && (
        <>
          {(data.quality.truncated || data.surveys.truncated || data.surveyStatus.truncated) && (
            <p role="status" className="text-muted-foreground">
              El servidor indica que el reporte está truncado.
            </p>
          )}
          <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-background shadow-card">
            <h2 className="bg-muted/60 p-4 text-center text-base font-bold text-muted-foreground">
              TABLA 1: ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO (ORGÁNICO, VSL Y LIG)
            </h2>
            <div className="space-y-6 p-4">
              <ReportTable
                title="TABLA 1.1: ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO VSL | CLOSER"
                table={data.quality}
                frozen={1}
                authoritative={!activeRange}
              />
              <FunnelLeadQualityTable
                title="TABLA 1.2: ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO ORGÁNICO"
                table={data.qualityOrganico}
                authoritative={!activeRange}
                filtered={!!data.filter}
                periodLabel={data.filter ? rangeLabel(data.filter) : undefined}
              />
              <FunnelLeadQualityTable
                title="TABLA 1.3: ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO LIG"
                table={data.qualityLIG}
                filtered={!!data.filter}
                periodLabel={data.filter ? rangeLabel(data.filter) : undefined}
                authoritative
              />
            </div>
          </section>
          <MonthlySurveyTable table={data.surveys} statusTable={data.surveyStatus} />
          <AppointmentsByFunnelTable
            table={data.appointmentsByFunnel}
            error={data.appointmentsByFunnelError}
          />
        </>
      )}
      {(historical.data || filtered.data) && (
        <div className={closer ? "hidden" : "contents"}>
          <VslCommercialTable
            range={commercialRange}
            refreshKey={`${revision}:${applied.revision}`}
          />
        </div>
      )}
      {!closer &&
        (data?.diagnostics?.warnings ?? []).map((warning, index) => (
          <p key={index} className="text-sm text-muted-foreground">
            {warning}
          </p>
        ))}
    </main>
  );
}
