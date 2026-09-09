import { Fragment, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { aggregateAppointments, CALENDARS, type AppointmentFilters } from "@/lib/appointments";
import { getAppointments, triggerAppointmentsReconciliation } from "@/services/appointments";
import { KpiCard } from "./KpiCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";

const panel = "rounded-xl border border-border bg-surface p-4 shadow-card";
const field =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function AppointmentsDashboard() {
  const [filters, setFilters] = useState<AppointmentFilters>({
    dateFrom: "",
    dateTo: "",
    closer: "",
    calendar: "",
    leadType: "",
  });
  const [syncing, setSyncing] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["vsl-citas"],
    queryFn: ({ signal }) => getAppointments(signal),
    retry: false,
    refetchOnWindowFocus: !syncing,
    refetchOnReconnect: !syncing,
  });
  const data = query.data;
  const invalidRange = Boolean(
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo,
  );
  const report = useMemo(
    () => aggregateAppointments(data?.appointments ?? [], filters),
    [data, filters],
  );
  const options = useMemo(
    () => ({
      closers: [...new Set(data?.appointments.map((a) => a.closer) ?? [])].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    }),
    [data],
  );
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setSyncing(true);
    setMessage("");
    let reconciled = false;
    try {
      await triggerAppointmentsReconciliation();
      reconciled = true;
      const result = await query.refetch();
      if (result.isError) throw result.error;
      setMessage("Datos actualizados");
      toast.success("Datos actualizados");
    } catch (error) {
      const text = reconciled
        ? "La actualización terminó, pero no se pudo recargar el reporte. Reintenta la lectura."
        : error instanceof Error
          ? error.message
          : "No se pudieron actualizar las citas.";
      setMessage(text);
      toast.error(text);
    } finally {
      lock.current = false;
      setSyncing(false);
    }
  }
  return (
    <main className="min-h-screen w-full bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <Link
          to="/reports"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a reportes
        </Link>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              VSL | CITAS Y CALENDARIOS
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seguimiento de agendamientos y sesiones efectivas
            </p>
          </div>
          <Button onClick={() => void refresh()} disabled={syncing || query.isFetching}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Actualizando…" : "Actualizar datos"}
          </Button>
        </header>
        <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {message || (data && query.isFetching ? "Consultando datos…" : "")}
        </div>
        <section
          aria-label="Filtros de citas"
          className={`${panel} grid gap-3 sm:grid-cols-2 lg:grid-cols-5`}
        >
          <label className="text-xs font-medium text-muted-foreground">
            Fecha desde
            <input
              type="date"
              className={`${field} mt-1`}
              value={filters.dateFrom}
              aria-invalid={invalidRange}
              aria-describedby={invalidRange ? "appointment-date-error" : undefined}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Fecha hasta
            <input
              type="date"
              className={`${field} mt-1`}
              value={filters.dateTo}
              aria-invalid={invalidRange}
              aria-describedby={invalidRange ? "appointment-date-error" : undefined}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Closer
            <select
              className={`${field} mt-1`}
              value={filters.closer}
              onChange={(e) => setFilters({ ...filters, closer: e.target.value })}
            >
              <option value="">Todos</option>
              {options.closers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Calendario
            <select
              className={`${field} mt-1`}
              value={filters.calendar}
              onChange={(e) => setFilters({ ...filters, calendar: e.target.value })}
            >
              <option value="">Todos</option>
              {CALENDARS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Tipo de lead
            <select
              className={`${field} mt-1`}
              value={filters.leadType}
              onChange={(e) => {
                const value = e.target.value;
                setFilters({ ...filters, leadType: value === "pagado" || value === "organico" ? value : "" });
              }}
            >
              <option value="">Todos</option>
              <option value="pagado">Pagado</option>
              <option value="organico">Orgánico</option>
            </select>
          </label>
        </section>
        {invalidRange && (
          <p id="appointment-date-error" role="alert" className="text-sm text-destructive">
            La fecha inicial no puede ser posterior a la fecha final.
          </p>
        )}
        {query.isError && (
          <div role="alert" className={`${panel} text-sm`}>
            <p>{query.error.message}</p>
            {data && (
              <p className="mt-1 text-muted-foreground">
                Se conservan los últimos datos disponibles.
              </p>
            )}
            <Button
              variant="outline"
              className="mt-3"
              disabled={query.isFetching || syncing}
              onClick={() => void query.refetch()}
            >
              Reintentar lectura
            </Button>
          </div>
        )}
        {!data && query.isPending && (
          <div role="status" aria-label="Cargando citas" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        )}
        {data && (
          <>
            {data.invalid > 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                Se excluyeron {data.invalid} registros sin identificador o fecha válida. Revisa la
                fuente de citas.
              </p>
            )}
            <section aria-label="Indicadores de citas" className="grid gap-3 sm:grid-cols-3">
              <KpiCard label="TOTAL AGENDAMIENTOS" value={report.total} />
              <KpiCard
                label="SESIONES EFECTIVAS"
                value={report.effective}
                accent="var(--status-asistio)"
              />
              <KpiCard
                label="% ASISTENCIA"
                value={`${report.attendance.toLocaleString("es-PE", { maximumFractionDigits: 2 })}%`}
              />
            </section>
            {!report.total && (
              <p role="status" className={`${panel} text-sm text-muted-foreground`}>
                No hay citas para los filtros seleccionados.
              </p>
            )}
            <section className={panel} aria-label="Evolución diaria de citas">
              <h2 className="text-sm font-semibold">Agendamientos y sesiones efectivas por día</h2>
              <p className="mt-1 text-xs text-muted-foreground">Fecha de la cita · America/Lima</p>
              <div className="mt-4 h-80 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={report.days}
                    margin={{ top: 8, right: 12, bottom: 8, left: -20 }}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      minTickGap={24}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(date: string) =>
                        `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
                      }
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        borderColor: "var(--border)",
                        borderRadius: 10,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="linear"
                      dataKey="appointments"
                      name="Agendamientos"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="linear"
                      dataKey="effective"
                      name="Sesiones efectivas"
                      stroke="var(--status-asistio)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className={panel}>
              <h2 className="mb-4 text-sm font-semibold">
                SESIONES EFECTIVAS POR CLOSER Y CALENDARIO
              </h2>
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>CLOSER</TableHead>
                    <TableHead className="text-right">TOTAL AGENDAMIENTOS</TableHead>
                    <TableHead className="text-right">SESIONES EFECTIVAS</TableHead>
                    <TableHead className="text-right">% ASISTENCIA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.table.map((row) => (
                    <Fragment key={row.closer}>
                      <TableRow className="bg-muted/40">
                        <TableHead
                          colSpan={4}
                          scope="rowgroup"
                          className="font-semibold text-foreground"
                        >
                          {row.closer}
                        </TableHead>
                      </TableRow>
                      {CALENDARS.map((calendar, i) => (
                        <TableRow key={calendar.id}>
                          <TableCell className="pl-8 text-xs">
                            {calendar.label} SESIONES EFECTIVAS
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.categories[i]?.totalAppointments ?? 0}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.counts[i]}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(row.categories[i]?.attendanceRate ?? 0).toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell>Total {row.closer}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.totalAppointments}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.attendanceRate.toFixed(2)}%</TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>TOTAL GENERAL</TableCell>
                    <TableCell className="text-right tabular-nums">{report.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{report.effective}</TableCell>
                    <TableCell className="text-right tabular-nums">{report.attendance.toFixed(2)}%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
