import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { DashboardFilters } from "@/components/reports/DashboardFilters";
import { ExecutiveSummary } from "@/components/reports/ExecutiveSummary";
import { calendarPresentation } from "@/lib/calendar-presentation";
import { hasSelectedSetter } from "@/lib/executive-presentation";
import { SetterStatusTable } from "@/components/reports/SetterStatusTable";
import { appointmentDetailFilters, getVslClosersReport } from "@/services/reports";
import { AppointmentDetailModal } from "@/components/reports/AppointmentDetailModal";
import { triggerVslReconciliation } from "@/services/reconciliation.service";
import { RefreshButton } from "@/components/reports/RefreshButton";
import { LoadingModal } from "@/components/reports/LoadingModal";
import { LeadDetailTable } from "@/components/reports/LeadDetailTable";
import { SalesSection } from "@/components/reports/SalesSection";
import { ExecutivePerformance } from "@/components/reports/ExecutivePerformance";
import { getPipelineCardMetrics } from "@/lib/pipeline-summary";
import { getCanonicalSetterName, getSetterOptions } from "@/lib/setter-performance";
import {
  EMPTY_REPORT_FILTERS as EMPTY_FILTERS,
  changeReportFilters,
  isValidReportRange,
  isReportCloser,
  rangeForPreset,
} from "@/lib/report-filter-state";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AppointmentDetailFilters,
  DatePreset,
  DetailQuery,
  ReportFilters,
  VslClosersReport,
} from "@/types/reports";

const INITIAL_DETAIL: DetailQuery = {
  includeDetail: false,
  search: "",
  page: 1,
  pageSize: 25,
  sort: "nombreContacto",
  direction: "asc",
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Lima",
  });
}

export function VslClosersDashboard() {
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [appointmentSelection, setAppointmentSelection] = useState<{
    name: string;
    count: number;
    filters: AppointmentDetailFilters;
    sourceNames?: string[];
    effectiveSetter?: string;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [detail, setDetail] = useState<DetailQuery>(INITIAL_DETAIL);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(detail.search), 300);
    return () => clearTimeout(timer);
  }, [detail.search]);

  const contextFilters = useMemo(
    () => ({ ...EMPTY_FILTERS, pipeline: filters.pipeline ?? "all", leadType: filters.leadType }),
    [filters.pipeline, filters.leadType],
  );
  const contextDetail = INITIAL_DETAIL;
  const contextQuery = useQuery({
    queryKey: ["vsl-closers", contextFilters, contextDetail, undefined],
    queryFn: ({ signal }) => getVslClosersReport(contextFilters, contextDetail, signal),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const context =
    contextQuery.data?.filters?.pipeline === filters.pipeline ? contextQuery.data : undefined;
  const usesBooker = filters.pipeline === "oei" || filters.pipeline === "lig";
  const contextNames = useMemo(
    () =>
      usesBooker
        ? [
            ...(context?.availableBookers ?? []),
            ...(filters.pipeline === "oei"
              ? (context?.appointmentPeople?.oeiBookers ?? [])
              : (context?.appointmentPeople?.ligBookers ?? [])
            ).map((person) => person.name),
          ]
        : [
            ...(context?.availableSetters ?? []),
            ...(filters.pipeline === "all" ? (context?.availableBookers ?? []) : []),
            ...(context?.setters ?? []).map((row) => row.setter),
            ...(context?.performance?.asistenciaPorSetter ?? []).map((row) => row.setter),
          ],
    [usesBooker, context, filters.pipeline],
  );
  const person = usesBooker ? filters.booker : filters.setter;
  const apiNormalizedSetters = true;
  const sourceNames = getSetterOptions(contextNames, apiNormalizedSetters).find(
    (option) =>
      option.value === (apiNormalizedSetters ? person : (getCanonicalSetterName(person) ?? person)),
  )?.sourceNames;
  const requestSourceNames = undefined;
  const validRange = isValidReportRange(filters);
  const query = useQuery({
    queryKey: ["vsl-closers", filters, { ...detail, search }, requestSourceNames],
    queryFn: ({ signal }) =>
      getVslClosersReport(filters, { ...detail, search }, signal, requestSourceNames),
    enabled:
      validRange &&
      (filters.pipeline === "vsl" || !person || Boolean(sourceNames?.length)) &&
      (!filters.closer || isReportCloser(filters.closer)) &&
      (!filters.calendar || Boolean(context?.availableCalendars?.includes(filters.calendar))) &&
      (!filters.estadoAgenda ||
        Boolean(context?.availableStatuses?.includes(filters.estadoAgenda))),
    retry: false,
    refetchOnWindowFocus: !syncing,
    refetchOnReconnect: !syncing,
  });

  const validatedPipeline = useRef(filters.pipeline);
  useEffect(() => {
    if (!context || validatedPipeline.current === filters.pipeline) return;
    validatedPipeline.current = filters.pipeline;
    const allowed = getSetterOptions(contextNames, apiNormalizedSetters).map(
      (option) => option.value,
    );
    setFilters((previous) => ({
      ...previous,
      ...((previous.setter || previous.booker) &&
      !allowed.includes(
        apiNormalizedSetters
          ? previous.setter || previous.booker
          : (getCanonicalSetterName(previous.setter || previous.booker) ?? ""),
      )
        ? { setter: "", booker: "" }
        : {}),
      ...(previous.closer && !isReportCloser(previous.closer) ? { closer: "" } : {}),
      ...(previous.calendar && !context.availableCalendars?.includes(previous.calendar)
        ? { calendar: "" }
        : {}),
      ...(previous.estadoAgenda && !context.availableStatuses?.includes(previous.estadoAgenda)
        ? { estadoAgenda: "" }
        : {}),
    }));
  }, [context, filters.pipeline, contextNames, apiNormalizedSetters]);

  const [isFiltering, setIsFiltering] = useState(false);
  const [filterDelayDone, setFilterDelayDone] = useState(false);
  const filterFrame = useRef<number | undefined>(undefined);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filterVersion = useRef(0);
  const cancelFilterTransition = useCallback(() => {
    if (filterFrame.current !== undefined) cancelAnimationFrame(filterFrame.current);
    if (filterTimer.current !== undefined) clearTimeout(filterTimer.current);
  }, []);
  useEffect(
    () => () => {
      filterVersion.current++;
      cancelFilterTransition();
    },
    [cancelFilterTransition],
  );

  const runFilterTransition = useCallback(
    (apply: () => void) => {
      setAppointmentSelection(null);
      cancelFilterTransition();
      const version = ++filterVersion.current;
      setIsFiltering(true);
      setFilterDelayDone(false);
      // Paint stable placeholders before changing cascading controls.
      filterFrame.current = requestAnimationFrame(() => {
        filterFrame.current = requestAnimationFrame(() => {
          if (version !== filterVersion.current) return;
          apply();
          filterTimer.current = setTimeout(() => {
            if (version === filterVersion.current) setFilterDelayDone(true);
          }, 350);
        });
      });
    },
    [cancelFilterTransition],
  );
  useEffect(() => {
    if (filterDelayDone && !query.isFetching) setIsFiltering(false);
  }, [filterDelayDone, query.isFetching]);

  const handleChange = useCallback(
    (next: Partial<ReportFilters>) => {
      runFilterTransition(() => {
        setFilters((prev) => changeReportFilters(prev, next));
        setDetail((prev) => ({ ...prev, page: 1 }));
      });
    },
    [runFilterTransition],
  );

  const handlePreset = useCallback(
    (preset: DatePreset) => {
      runFilterTransition(() => {
        setDetail((prev) => ({ ...prev, page: 1 }));
        setFilters((prev) =>
          preset === "custom"
            ? { ...prev, preset }
            : { ...prev, preset, ...rangeForPreset(preset) },
        );
      });
    },
    [runFilterTransition],
  );

  const handleSync = useCallback(async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    setSyncMessage("");
    let reconciled = false;
    try {
      const result = await triggerVslReconciliation();
      reconciled = true;
      const refreshed = await query.refetch();
      if (refreshed.isError) throw refreshed.error;
      const message =
        result.inserted === 0 && result.updated === 0
          ? "Los datos ya estaban actualizados"
          : `${result.inserted} nuevos · ${result.updated} actualizados`;
      if (!result.ok || result.errors) {
        const warning = `Reconciliación con incidencias: ${message} · ${result.errors} errores`;
        setSyncMessage(warning);
        toast.warning(warning);
      } else {
        setSyncMessage(message);
        toast.success("Datos actualizados correctamente", { description: message });
      }
    } catch {
      const message = reconciled
        ? "La sincronización terminó, pero no se pudo recargar el reporte. Intenta nuevamente."
        : "No se pudo actualizar la información.";
      setSyncMessage(message);
      toast.error(message);
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [query]);

  const requestKey = JSON.stringify([filters, { ...detail, search }, requestSourceNames]);
  const lastReport = useRef<{ key: string; data: VslClosersReport } | undefined>(undefined);
  useEffect(() => {
    if (query.data) lastReport.current = { key: requestKey, data: query.data };
  }, [query.data, requestKey]);
  const cachedData = query.data ?? lastReport.current?.data;
  // The API owns filtering, appointment counts, sales and pagination.
  const data =
    query.data ?? (lastReport.current?.key === requestKey ? lastReport.current.data : undefined);
  const optionData =
    context ??
    (cachedData?.filters?.pipeline === filters.pipeline &&
    (filters.pipeline !== "vsl" || cachedData?.leadType === filters.leadType)
      ? cachedData
      : undefined);
  const initialLoading = !data && query.isLoading;
  const backgroundRefreshing = !!data && query.isFetching && !syncing;
  const cardMetrics = useMemo(
    () =>
      getPipelineCardMetrics(
        data?.pipelineSummary,
        data?.filters?.pipeline ?? filters.pipeline ?? "all",
      ),
    [data?.pipelineSummary, data?.filters?.pipeline, filters.pipeline],
  );
  const attendanceRate = data?.kpis.tasaAsistencia ?? 0;
  const peopleMode =
    filters.pipeline === "oei" || filters.pipeline === "lig"
      ? "booker"
      : filters.pipeline === "vsl"
        ? "setter"
        : "general";
  const calendar = useMemo(
    () => (data ? calendarPresentation(data, person) : undefined),
    [data, person],
  );
  const peopleRows = calendar?.rows ?? [];
  useEffect(() => {
    const cardTotal = cardMetrics.totalAppointments;
    const tableTotal =
      data?.filters.pipeline === "vsl" ? data.leadTypeKpis.totalAppointments : data?.kpis.total;
    if (
      import.meta.env.DEV &&
      data &&
      data.filters?.pipeline === filters.pipeline &&
      cardTotal != null &&
      cardTotal !== tableTotal
    ) {
      console.warn("CALENDAR TOTAL MISMATCH", { cardTotal, tableTotal });
    }
  }, [data, cardMetrics.totalAppointments, filters.pipeline]);

  return (
    <div
      className="min-h-screen w-full bg-background px-4 py-6"
      aria-busy={syncing || initialLoading || isFiltering}
    >
      <LoadingModal
        open={syncing}
        title={syncing ? "Actualizando datos..." : "Cargando reporte..."}
        description={
          syncing
            ? "Sincronizando las oportunidades con GoHighLevel. Esto puede tardar unos segundos."
            : "Obteniendo la información del reporte comercial."
        }
      />
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <Link
              to="/reports"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a reportes
            </Link>
            <h1 className="mt-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              REPORTE COMERCIAL — VSL | CLOSERS + OEI
            </h1>
            <p className="text-sm text-muted-foreground">
              Agenda y desempeño comercial por embudo y Setter
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Última actualización: {data ? formatUpdatedAt(data.updatedAt) : "—"}
              {backgroundRefreshing && (
                <span role="status" className="ml-2">
                  Actualizando...
                </span>
              )}
            </p>
          </div>

          <RefreshButton busy={syncing} onClick={handleSync} />
        </header>

        {syncMessage && (
          <p role="status" className="text-sm">
            {syncMessage}
          </p>
        )}
        {data?.source === "development" && (
          <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Datos de ejemplo · Solo desarrollo. La lectura del Google Sheet aún no está configurada.
          </p>
        )}
        <DashboardFilters
          apiNormalizedSetters={apiNormalizedSetters}
          filters={filters}
          setters={[
            ...(optionData?.availableSetters ?? []),
            ...(optionData?.setters ?? []).map((row) => row.setter),
            ...(optionData?.performance?.asistenciaPorSetter ?? []).map((row) => row.setter),
          ]}
          bookers={optionData?.availableBookers ?? []}
          closers={optionData?.availableClosers ?? []}
          origins={optionData?.availableOrigins ?? []}
          calendars={optionData?.availableCalendars ?? []}
          statuses={optionData?.availableStatuses ?? []}
          busy={contextQuery.isFetching && !context}
          onChange={handleChange}
          onPreset={handlePreset}
          onClear={() =>
            runFilterTransition(() => {
              setFilters(EMPTY_FILTERS);
              setDetail((prev) => ({ ...prev, page: 1 }));
            })
          }
        />

        {query.isError && data && !syncing && (
          <p role="status" className="text-xs text-muted-foreground">
            No se pudo actualizar el reporte en segundo plano. Se mantienen los últimos datos
            cargados.
          </p>
        )}
        {!validRange ? (
          <p
            role="alert"
            className="rounded-xl border border-border bg-surface p-4 text-sm text-destructive"
          >
            Revisa el rango de fechas para consultar el reporte.
          </p>
        ) : initialLoading || isFiltering || (person && !sourceNames && contextQuery.isFetching) ? (
          <div role="status" aria-label="Actualizando reporte" className="space-y-4">
            <span className="text-xs text-muted-foreground">Actualizando reporte...</span>
            <div
              className={
                filters.pipeline === "vsl"
                  ? `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${hasSelectedSetter(filters) ? "2xl:grid-cols-5" : "2xl:grid-cols-6"}`
                  : hasSelectedSetter(filters)
                    ? "grid gap-4 sm:grid-cols-3"
                    : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              }
            >
              {Array.from(
                {
                  length:
                    (hasSelectedSetter(filters) ? 3 : 4) + (filters.pipeline === "vsl" ? 2 : 0),
                },
                (_, key) => (
                  <Skeleton key={key} className="h-28 rounded-xl" />
                ),
              )}
            </div>
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : (query.isError || contextQuery.isError) && !data ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-foreground">
              {(query.error ?? contextQuery.error) instanceof Error
                ? (query.error ?? contextQuery.error)?.message
                : "No se pudo cargar el reporte."}
            </p>
            <button
              onClick={() => {
                void contextQuery.refetch();
                void query.refetch();
              }}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              Reintentar
            </button>
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground shadow-card">
            No existen registros para los filtros seleccionados.
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Resumen ejecutivo</h2>
            <ExecutiveSummary report={data} filters={filters} />
            <ExecutivePerformance
              report={data}
              setterSelected={hasSelectedSetter(filters)}
              selectedSetter={person}
              setterDetails={
                <>
                  {cardMetrics.totalLeads === 0 && (
                    <p>No existen registros para los filtros seleccionados.</p>
                  )}
                  <SetterStatusTable
                    rows={peopleRows}
                    selectedSetter={person}
                    error={calendar?.error}
                    totals={data.kpis}
                    mode={peopleMode}
                    showStatuses={
                      peopleMode !== "booker" ||
                      filters.pipeline === "oei" ||
                      filters.pipeline === "lig"
                    }
                    busy={
                      query.isFetching ||
                      query.isError ||
                      !query.data ||
                      isFiltering ||
                      !!appointmentSelection
                    }
                    onDetail={(person, status, count, sourceNames) => {
                      setAppointmentSelection(
                        (current) =>
                          current ?? {
                            name: person || "Total general",
                            ...(person ? { effectiveSetter: person } : {}),
                            count,
                            filters: appointmentDetailFilters(filters, person, status),
                            ...(sourceNames ? { sourceNames } : {}),
                          },
                      );
                    }}
                  />
                </>
              }
            />
            {appointmentSelection && (
              <AppointmentDetailModal
                key={JSON.stringify(appointmentSelection.filters)}
                selection={appointmentSelection}
                onClose={() => setAppointmentSelection(null)}
              />
            )}
            <SalesSection
              hideSummary
              sales={data.sales}
              available={data.salesAvailable}
              pipeline={filters.pipeline ?? "all"}
            />
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={detail.includeDetail}
            onChange={(e) => setDetail((prev) => ({ ...prev, includeDetail: e.target.checked }))}
          />{" "}
          Mostrar detalle de leads
        </label>
        {detail.includeDetail && (
          <LeadDetailTable
            rows={data?.detail ?? []}
            total={data?.detailTotal ?? 0}
            page={data?.detailPage ?? 1}
            query={detail}
            onChange={(next) => setDetail((prev) => ({ ...prev, ...next }))}
            busy={query.isFetching}
          />
        )}
      </div>
    </div>
  );
}
