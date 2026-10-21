import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getEffectiveAppointmentRows } from "@/lib/setter-performance";
import { getAppointmentDetail } from "@/services/reports";
import { isValidReportRange, rangeForPreset } from "@/lib/report-filter-state";
import type {
  AppointmentDateField,
  AppointmentDetailFilters,
  AppointmentDetailRow,
  BookingMode,
} from "@/types/reports";

const columns: [keyof AppointmentDetailRow, string][] = [
  ["nombreContacto", "Nombre"],
  ["telefono", "Teléfono"],
  ["setterAsignado", "Setter asignado"],
  ["fase", "Fase"],
  ["calendario", "Calendario"],
  ["estado", "Estado"],
  ["fechaCreacionCita", "Fecha creación cita"],
  ["fechaReunion", "Fecha reunión"],
  ["diferenciaDiasLabel", "Diferencia"],
  ["vslOrigen", "VSL Origen"],
  ["closer", "Closer"],
];

export function AppointmentDetailModal({
  selection,
  onClose,
}: {
  selection: {
    name: string;
    count: number;
    filters: AppointmentDetailFilters;
    sourceNames?: string[];
    effectiveSetter?: string;
  };
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(selection.filters.search);
  const [appliedSearch, setAppliedSearch] = useState(selection.filters.search);
  const [dateField, setDateField] = useState<AppointmentDateField>(
    selection.filters.dateField ?? "appointmentCreated",
  );
  const [dates, setDates] = useState({
    dateFrom: selection.filters.dateFrom,
    dateTo: selection.filters.dateTo,
  });
  const [bookingMode, setBookingMode] = useState<BookingMode | "">(
    selection.filters.bookingMode ?? "",
  );
  const [dayGap, setDayGap] = useState(selection.filters.dayGap ?? "");
  const changeDates = (next: Partial<typeof dates>) => {
    setPage(1);
    setDates((previous) => ({ ...previous, ...next }));
  };
  useEffect(() => {
    if (search === appliedSearch) return;
    const timer = setTimeout(() => {
      setPage(1);
      setAppliedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, appliedSearch]);
  useEffect(() => {
    setPage(1);
    setSearch(selection.filters.search);
    setAppliedSearch(selection.filters.search);
    setDateField(selection.filters.dateField ?? "appointmentCreated");
    setDates({ dateFrom: selection.filters.dateFrom, dateTo: selection.filters.dateTo });
    setBookingMode(selection.filters.bookingMode ?? "");
    setDayGap(selection.filters.dayGap ?? "");
  }, [selection.filters]);
  const searching = search !== appliedSearch;
  const validDates = isValidReportRange(dates);
  const detailFilters = {
    ...selection.filters,
    ...dates,
    dateField,
    bookingMode,
    dayGap,
    search: appliedSearch,
  };
  const query = useQuery({
    queryKey: ["appointment-detail", detailFilters, page],
    queryFn: ({ signal }) => getAppointmentDetail(detailFilters, page, signal),
    enabled: !searching && validDates,
    retry: false,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error)
      console.error("No fue posible cargar el detalle de agendamientos.", query.error);
  }, [query.error]);
  const data = searching || !validDates ? undefined : query.data;
  const visibleRows = selection.effectiveSetter
    ? getEffectiveAppointmentRows(data?.rows ?? [], selection.effectiveSetter)
    : (data?.rows ?? []);
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1);
  const available = query.data?.filters?.available;
  const dateFields = available?.dateFields ?? [
    { value: "appointmentCreated", label: "Fecha de creación de cita" },
    { value: "meetingDate", label: "Fecha de cita / reunión" },
  ];
  const bookingModes = available?.bookingModes ?? [
    { value: "automatic", label: "Agendado automático" },
    { value: "manual", label: "Agendado manual" },
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-7xl overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>Detalle de agendamientos — {selection.name}</DialogTitle>
          <DialogDescription>
            {data
              ? selection.effectiveSetter
                ? `${visibleRows.length} citas del setter en esta página · Cifra seleccionada: ${selection.count}`
                : `${data.pagination.totalRecords} registros`
              : `Cifra seleccionada: ${selection.count}`}
            {selection.filters.status && ` · Estado: ${selection.filters.status}`}
          </DialogDescription>
        </DialogHeader>
        <input
          type="search"
          aria-label="Buscar por nombre, teléfono o correo"
          placeholder="Buscar por nombre, teléfono o correo..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand"
        />
        <section aria-label="Fechas del detalle" className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="min-w-0 text-xs text-muted-foreground">
              Fecha
              <select
                aria-label="Fecha del detalle"
                value={dateField}
                onChange={(event) => {
                  setPage(1);
                  setDateField(event.target.value as AppointmentDateField);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              >
                {dateFields.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === "appointmentCreated"
                      ? "Fecha de creación de cita"
                      : "Fecha de cita / reunión"}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              Desde
              <input
                type="date"
                value={dates.dateFrom}
                onChange={(event) => {
                  if (event.target.validity.valid) changeDates({ dateFrom: event.target.value });
                }}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              />
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              Hasta
              <input
                type="date"
                value={dates.dateTo}
                onChange={(event) => {
                  if (event.target.validity.valid) changeDates({ dateTo: event.target.value });
                }}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => changeDates(rangeForPreset("mes"))}>
              Este mes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => changeDates(rangeForPreset("mesPasado"))}
            >
              Mes pasado
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => changeDates({ dateFrom: "", dateTo: "" })}
            >
              Limpiar fechas
            </Button>
          </div>
        </section>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Tipo de agendamiento
            <select
              aria-label="Tipo de agendamiento"
              value={bookingMode}
              onChange={(event) => {
                setPage(1);
                setBookingMode(event.target.value as BookingMode | "");
              }}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            >
              <option value="">Todos</option>
              {bookingModes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Diferencia de días
            <select
              aria-label="Diferencia de días"
              value={dayGap}
              onChange={(event) => {
                setPage(1);
                setDayGap(event.target.value);
              }}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            >
              <option value="">Todos</option>
              {(available?.dayGaps ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!validDates ? (
          <p role="alert" className="text-sm text-destructive">
            La fecha Desde debe ser anterior o igual a Hasta.
          </p>
        ) : query.isFetching || searching ? (
          <p role="status">Cargando agendamientos...</p>
        ) : query.isError ? (
          <div role="alert" className="space-y-3">
            <p>No fue posible cargar el detalle de agendamientos.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          data && (
            <>
              {!selection.effectiveSetter && (
                <p className="text-sm text-muted-foreground">
                  Total: {data.summary.total} · Confirmado: {data.summary.confirmado} · Asistió:{" "}
                  {data.summary.asistio}
                  {` · Cancelado: ${data.summary.cancelado} · No asistió: ${data.summary.noShow} · Asistencia: ${data.summary.tasaAsistencia}%`}
                </p>
              )}
              {selection.effectiveSetter && (
                <p className="text-sm text-muted-foreground">
                  Solo se muestran citas cuyo setter efectivo identifica la API. La paginación
                  corresponde a la búsqueda de origen, que puede incluir otros responsables; no se
                  usan sus totales como cifras del setter.
                </p>
              )}
              {!selection.effectiveSetter &&
                !appliedSearch &&
                !bookingMode &&
                !dayGap &&
                dateField === "appointmentCreated" &&
                dates.dateFrom === selection.filters.dateFrom &&
                dates.dateTo === selection.filters.dateTo &&
                data.pagination.totalRecords !== selection.count && (
                  <p role="status" className="text-sm text-muted-foreground">
                    La API devuelve {data.pagination.totalRecords} registros para la cifra
                    seleccionada ({selection.count}).
                  </p>
                )}
              {visibleRows.length === 0 ? (
                <p>
                  {selection.effectiveSetter
                    ? "No hay citas con atribución verificable a este setter en esta página."
                    : "No se encontraron agendamientos para los filtros seleccionados."}
                </p>
              ) : (
                <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[1500px] text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        {columns.map(([key, label]) => (
                          <th key={key} className="px-3 py-2 text-left font-medium">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, index) => (
                        <tr
                          key={row.appointmentId || `${page}-${index}`}
                          className="border-t border-border"
                        >
                          {columns.map(([key]) => (
                            <td
                              key={key}
                              className="min-w-[110px] max-w-[240px] break-words px-3 py-2 align-top"
                            >
                              {key === "agendadoPor"
                                ? row.agendadoPor ||
                                  row.setterEfectivo ||
                                  row.creadoPorCitaNormalizado ||
                                  row.setterAsignado ||
                                  "Agendado automático"
                                : key === "setterAsignado"
                                  ? row.setterAsignado || row.setterOpportunity || "—"
                                  : key === "bookingModeLabel"
                                    ? row.bookingMode === "automatic"
                                      ? "Agendado automático"
                                      : row.bookingMode === "manual"
                                        ? "Agendado manual"
                                        : row.bookingModeLabel || "—"
                                    : key === "fechaReunion"
                                      ? row.fechaReunion || row.fechaCita || "—"
                                      : key === "fase"
                                        ? row.fase || "—"
                                        : (row[key] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            disabled={!validDates || query.isFetching || searching || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm">
            Página {data?.pagination.page ?? page}
            {data && ` de ${totalPages}`}
          </span>
          <Button
            variant="outline"
            disabled={!validDates || query.isFetching || searching || !data || page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
