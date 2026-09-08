import { useCallback, useMemo, useState, useEffect } from "react";
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
import { LeadDetailTable } from "@/components/reports/LeadDetailTable";
import type { DatePreset, DetailQuery, ReportFilters } from "@/types/reports";

const EMPTY_FILTERS: ReportFilters = {
  preset: "todos",
  dateFrom: "",
  dateTo: "",
  setter: "",
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
  });

  const handleChange = useCallback((next: Partial<ReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    setDetail((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePreset = useCallback((preset: DatePreset) => {
    setDetail((prev) => ({ ...prev, page: 1 }));
    setFilters((prev) =>
      preset === "custom" ? { ...prev, preset } : { ...prev, preset, ...rangeForPreset(preset) },
    );
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const result = await triggerVslReconciliation();
      const message = `${result.newRecords} nuevos · ${result.updated} actualizados · ${result.errors} errores`;
      setSyncMessage(`${message} · ${formatUpdatedAt(result.timestamp)}`);
      const refreshed = await query.refetch();
      if (!result.ok || result.errors) toast.warning(`Reconciliación con incidencias: ${message}`);
      else if (refreshed.isError)
        toast.warning("Reconciliación completada; no se pudo recargar el reporte.");
      else toast.success(`Datos actualizados correctamente. ${message}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar. Intenta nuevamente.";
      setSyncMessage(message);
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }, [query]);

  const data = query.data;
  const kpis = data?.kpis;

  const kpiCards = useMemo(
    () =>
      kpis
        ? [
            { label: "Total de leads", value: kpis.total },
            { label: "Agendado CRM", value: kpis.agendadoCRM, accent: "var(--status-agendado)" },
            { label: "Asistió", value: kpis.asistio, accent: "var(--status-asistio)" },
            { label: "Cancelado", value: kpis.cancelado, accent: "var(--status-cancelado)" },
            { label: "No show", value: kpis.noShow, accent: "var(--status-noshow)" },
            {
              label: "Pendiente de agenda",
              value: kpis.pendienteAgenda,
              accent: "var(--status-pendiente)",
            },
            { label: "Reagendado", value: kpis.reagendado, accent: "var(--status-reagendado)" },
            {
              label: "Tasa de asistencia",
              value: `${kpis.tasaAsistencia}%`,
              hint: `No show: ${kpis.tasaNoShow}%`,
            },
          ]
        : [],
    [kpis],
  );

  return (
    <div className="min-h-screen w-full bg-background px-4 py-6">
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
              REPORTE COMERCIAL — VSL | CLOSERS
            </h1>
            <p className="text-sm text-muted-foreground">
              Seguimiento de agenda y desempeño por Setter
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Última actualización: {data ? formatUpdatedAt(data.updatedAt) : "—"}
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
          setters={data?.availableSetters ?? []}
          closers={data?.availableClosers ?? []}
          origins={data?.availableOrigins ?? []}
          onChange={handleChange}
          onPreset={handlePreset}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />

        {query.isLoading ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground shadow-card">
            Cargando reporte...
          </div>
        ) : query.isError ? (
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              {kpiCards.map((card) => (
                <KpiCard key={card.label} {...card} />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SetterStatusChart rows={data.setters} tasaAsistencia={data.kpis.tasaAsistencia} />
              <ConversionSummary kpis={data.kpis} />
            </div>

            {data.kpis.total === 0 && <p>No existen registros para los filtros seleccionados.</p>}
            <SetterStatusTable rows={data.setters} totals={data.kpis} />
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
