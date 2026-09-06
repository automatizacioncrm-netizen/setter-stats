import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DashboardFilters } from "@/components/reports/DashboardFilters";
import { KpiCard } from "@/components/reports/KpiCard";
import { SetterStatusTable } from "@/components/reports/SetterStatusTable";
import { SetterStatusChart } from "@/components/reports/SetterStatusChart";
import { ConversionSummary } from "@/components/reports/ConversionSummary";
import { getVslClosersReport, triggerVslReconciliation } from "@/services/reports";
import type { DatePreset, ReportFilters } from "@/types/reports";

const EMPTY_FILTERS: ReportFilters = {
  preset: "todos",
  dateFrom: "",
  dateTo: "",
  setter: "",
  estadoAgenda: "",
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeForPreset(preset: DatePreset): { dateFrom: string; dateTo: string } {
  const today = new Date();
  switch (preset) {
    case "hoy":
      return { dateFrom: iso(today), dateTo: iso(today) };
    case "ayer": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { dateFrom: iso(y), dateTo: iso(y) };
    }
    case "7dias": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { dateFrom: iso(from), dateTo: iso(today) };
    }
    case "mes": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
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
  });
}

export function VslClosersDashboard() {
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [syncing, setSyncing] = useState(false);

  const query = useQuery({
    queryKey: ["vsl-closers", filters],
    queryFn: () => getVslClosersReport(filters),
    placeholderData: (prev) => prev,
  });

  const handleChange = useCallback((next: Partial<ReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const handlePreset = useCallback((preset: DatePreset) => {
    setFilters((prev) =>
      preset === "custom"
        ? { ...prev, preset }
        : { ...prev, preset, ...rangeForPreset(preset) },
    );
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await triggerVslReconciliation();
      await query.refetch();
      toast.success(result.message);
    } catch {
      toast.error("No se pudo actualizar. Intenta nuevamente.");
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
            { label: "Total de oportunidades", value: kpis.total },
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

          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncing ? "Actualizando..." : "Actualizar datos"}
          </button>
        </header>

        <DashboardFilters
          filters={filters}
          setters={data?.availableSetters ?? []}
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
              No se pudo cargar la información. Intenta nuevamente.
            </p>
            <button
              onClick={() => query.refetch()}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              Reintentar
            </button>
          </div>
        ) : !data || data.setters.length === 0 ? (
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

            <SetterStatusTable rows={data.setters} />
          </>
        )}
      </div>
    </div>
  );
}
