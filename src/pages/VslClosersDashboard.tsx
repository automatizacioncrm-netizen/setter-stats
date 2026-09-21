import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { DashboardFilters } from "@/components/reports/DashboardFilters";
import { KpiCard } from "@/components/reports/KpiCard";
import { SetterStatusTable } from "@/components/reports/SetterStatusTable";
import { SetterStatusChart } from "@/components/reports/SetterStatusChart";
import { ConversionSummary } from "@/components/reports/ConversionSummary";
import { getVslClosersReport } from "@/services/reports";
import { triggerVslReconciliation } from "@/services/reconciliation.service";
import { RefreshButton } from "@/components/reports/RefreshButton";
import { LoadingModal } from "@/components/reports/LoadingModal";
import { LeadDetailTable } from "@/components/reports/LeadDetailTable";
import { SalesSection } from "@/components/reports/SalesSection";
import { getPipelineCardMetrics } from "@/lib/pipeline-summary";
import type { DatePreset, DetailQuery, ReportFilters, VslClosersReport } from "@/types/reports";

const EMPTY_FILTERS: ReportFilters = {
  preset: "todos",
  pipeline: "all",
  leadType: "all",
  calendar: "",
  dateFrom: "",
  dateTo: "",
  setter: "",
  booker: "",
  estadoAgenda: "",
  closer: "",
  vslOrigen: "",
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeForPreset(preset: DatePreset): { dateFrom: string; dateTo: string } {
  const today = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()) + "T12:00:00Z",
  );
  switch (preset) {
    case "hoy":
      return { dateFrom: iso(today), dateTo: iso(today) };
    case "ayer": {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      return { dateFrom: iso(y), dateTo: iso(y) };
    }
    case "7dias": {
      const from = new Date(today);
      from.setUTCDate(from.getUTCDate() - 6);
      return { dateFrom: iso(from), dateTo: iso(today) };
    }
    case "mes": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { dateFrom: iso(from), dateTo: iso(today) };
    }
    default:
      return { dateFrom: "", dateTo: "" };
  }
}

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
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [detail, setDetail] = useState<DetailQuery>({
    includeDetail: false,
    search: "",
    page: 1,
    pageSize: 25,
    sort: "nombreContacto",
    direction: "asc",
  });
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(detail.search), 300);
    return () => clearTimeout(timer);
  }, [detail.search]);

  const query = useQuery({
    queryKey: ["vsl-closers", filters, { ...detail, search }],
    queryFn: ({ signal }) => getVslClosersReport(filters, { ...detail, search }, signal),
    retry: false,
    refetchOnWindowFocus: !syncing,
    refetchOnReconnect: !syncing,
  });

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
      cancelFilterTransition();
      const version = ++filterVersion.current;
      setIsFiltering(true);
      setFilterDelayDone(false);
      // Allow the existing modal to paint before changing cascading controls.
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
        setFilters((prev) => {
          if (next.pipeline && next.pipeline !== prev.pipeline)
            return {
              ...prev,
              pipeline: next.pipeline,
              leadType: "all",
              calendar: "",
              setter: "",
              booker: "",
              closer: "",
              estadoAgenda: "",
              vslOrigen: "",
            };
          if (next.leadType && next.leadType !== prev.leadType)
            return {
              ...prev,
              leadType: next.leadType,
              calendar: "",
              setter: "",
              booker: "",
              closer: "",
              estadoAgenda: "",
            };
          if (next.calendar !== undefined && next.calendar !== prev.calendar)
            return { ...prev, calendar: next.calendar, setter: "", booker: "", closer: "" };
          if (
            Object.keys(next).length === 1 &&
            next.setter !== undefined &&
            next.setter !== prev.setter
          )
            return { ...prev, setter: next.setter, closer: "" };
          if (
            Object.keys(next).length === 1 &&
            next.booker !== undefined &&
            next.booker !== prev.booker
          )
            return { ...prev, booker: next.booker, closer: "" };
          return { ...prev, ...next };
        });
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

  const lastReport = useRef<VslClosersReport | undefined>(undefined);
  useEffect(() => {
    if (query.data) lastReport.current = query.data;
  }, [query.data]);
  const data = query.data ?? lastReport.current;
  const optionData =
    data?.filters?.pipeline === filters.pipeline &&
    (filters.pipeline !== "vsl" || data?.leadType === filters.leadType)
      ? data
      : undefined;
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
    filters.pipeline === "oei" ? "booker" : filters.pipeline === "vsl" ? "setter" : "general";
  const peopleRows = useMemo(
    () =>
      peopleMode === "booker"
        ? (data?.appointmentPeople?.oeiBookers ?? []).map((person) => ({
            setter: person.name,
            agendadoCRM: 0,
            confirmado: 0,
            asistio: 0,
            cancelado: 0,
            noShow: 0,
            pendienteAgenda: 0,
            reagendado: 0,
            total: person.total,
          }))
        : (data?.setters ?? []),
    [data?.appointmentPeople?.oeiBookers, data?.setters, peopleMode],
  );
  useEffect(() => {
    const cardTotal = cardMetrics.totalAppointments;
    const tableTotal = data?.kpis.total;
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

  const kpiCards = useMemo(
    () =>
      data
        ? [
            { label: "Total de leads", value: data.leadTypeKpis.totalLeads },
            {
              label: "Total de agendamientos",
              value: data.kpis.total,
              ...(data.filters?.dateFrom || data.filters?.dateTo
                ? { hint: `${data.kpis.total} citas en el período` }
                : cardMetrics.bookingRate == null
                  ? {}
                  : { hint: `${cardMetrics.bookingRate}% de los leads agendaron` }),
            },
            {
              label: "Asistió",
              value: data.kpis.asistio,
              accent: "var(--status-asistio)",
              hint: `${attendanceRate}% de asistencia`,
            },
          ]
        : [],
    [data, cardMetrics, attendanceRate],
  );

  return (
    <div
      className="min-h-screen w-full bg-background px-4 py-6"
      aria-busy={syncing || initialLoading || isFiltering}
    >
      <LoadingModal
        open={syncing || initialLoading || isFiltering}
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
        {!!data?.unknownStatusCount && (
          <p role="status" className="text-sm">
            {data.unknownStatusCount} registros con estado vacío o desconocido: visibles en detalle,
            excluidos del resumen y las tasas.
          </p>
        )}
        <DashboardFilters
          filters={filters}
          setters={optionData?.availableSetters ?? []}
          bookers={optionData?.availableBookers ?? []}
          closers={optionData?.availableClosers ?? []}
          origins={optionData?.availableOrigins ?? []}
          calendars={optionData?.availableCalendars ?? []}
          onChange={handleChange}
          onPreset={handlePreset}
          onClear={() =>
            runFilterTransition(() => {
              setFilters({
                ...EMPTY_FILTERS,
                pipeline: filters.pipeline ?? "all",
                leadType: filters.pipeline === "vsl" ? filters.leadType : "all",
              });
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
        {initialLoading ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground shadow-card">
            Cargando reporte...
          </div>
        ) : query.isError && !data ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-foreground">
              {query.error instanceof Error ? query.error.message : "No se pudo cargar el reporte."}
            </p>
            <button
              onClick={() => query.refetch()}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {kpiCards.map((card) => (
                <KpiCard key={card.label} {...card} />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SetterStatusChart
                rows={peopleRows}
                tasaAsistencia={attendanceRate}
                mode={peopleMode}
              />
              <ConversionSummary kpis={data.kpis} />
            </div>

            {cardMetrics.totalLeads === 0 && (
              <p>No existen registros para los filtros seleccionados.</p>
            )}
            <SetterStatusTable rows={peopleRows} totals={data.kpis} mode={peopleMode} />
            <SalesSection
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
