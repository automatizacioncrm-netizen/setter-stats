import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDailyMeetingsReport } from "@/services/daily-meetings";
import type {
  DailyMeetingDay,
  DailyMeetingTotals,
  DailyMeetingsFilters,
} from "@/types/daily-meetings";
import { formatSaleQuotaDate } from "@/lib/sales-detail";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ExecutiveTable } from "./ExecutiveTable";
import { attendancePercentage } from "@/lib/attendance-percentage";

const summaryColumns = [
  ["totalCitas", "Total agendamientos"],
  ["confirmados", "Confirmados"],
  ["cancelados", "Cancelados"],
  ["asistidos", "Asistidos"],
  ["noAsistidos", "No asistidos"],
  ["sinEstado", "Sin estado"],
] as const;
const countColumns = summaryColumns.filter(([key]) => key !== "sinEstado");
const meetingRate = (row: DailyMeetingTotals) =>
  attendancePercentage(row.porcentajeAsistencia, row.asistidos, row.totalCitas);
const rateLabel = (row: DailyMeetingTotals) => {
  const value = meetingRate(row);
  return value === null ? "No disponible" : `${value.toFixed(2)} %`;
};
const dateLabel = (value: string) => (value ? formatSaleQuotaDate(value) : "—");

function MeetingDayModal({
  day,
  onClose,
  onRestoreFocus,
}: {
  day: DailyMeetingDay;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-7xl overflow-y-auto rounded-lg bg-surface"
        onEscapeKeyDown={onClose}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Detalle de citas — {dateLabel(day.fechaReunion)}</DialogTitle>
          <DialogDescription>
            Agendamientos con fecha de reunión programada para este día
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {summaryColumns.map(([key, label]) => (
            <div key={key} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{day[key]}</p>
            </div>
          ))}
        </div>
        {day.detalles.length !== day.totalCitas && (
          <p role="status" className="text-sm text-amber-800">
            La API entrega {day.detalles.length} registros para un total oficial de {day.totalCitas}{" "}
            citas.
          </p>
        )}
        <ExecutiveTable
          rows={day.detalles}
          rowKey={(row) => row.appointmentId}
          minWidth="min-w-[1800px]"
          empty="La API no entregó citas individuales para esta fecha."
          columns={[
            {
              key: "name",
              label: "Nombre del contacto",
              value: (row) => row.nombreContacto || "—",
            },
            { key: "phone", label: "Teléfono", value: (row) => row.telefono || "—" },
            { key: "email", label: "Correo electrónico", value: (row) => row.correo || "—" },
            { key: "pipeline", label: "Embudo", value: (row) => row.embudo || row.pipeline || "—" },
            { key: "calendar", label: "Calendario", value: (row) => row.calendario || "—" },
            { key: "setter", label: "Setter", value: (row) => row.setter || "—" },
            { key: "booker", label: "Agendador de cita", value: (row) => row.agendadorCita || "—" },
            { key: "closer", label: "Closer", value: (row) => row.closer || "—" },
            { key: "state", label: "Estado de Calendar", value: (row) => row.estado || "—" },
            {
              key: "meeting",
              label: "Fecha de reunión",
              value: (row) => row.fechaReunion,
              render: (row) => dateLabel(row.fechaReunion),
            },
            {
              key: "created",
              label: "Fecha de creación de cita",
              value: (row) => row.fechaCreacionCita,
              render: (row) => dateLabel(row.fechaCreacionCita),
            },
            { key: "stage", label: "Fase comercial", value: (row) => row.fase || "—" },
          ]}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const pipelineLabels = {
  all: "Todos los embudos",
  vsl: "VSL | Closers",
  oei: "Lanzamiento I. Pagado OEI - EM",
  lig: "Lanzamiento Interno Gratuito",
  organico: "Captación Orgánica",
  gira: "VSL GIRA",
};
export function DailyMeetingsReport({
  pipeline,
  dateFrom,
  dateTo,
  calendar = "",
}: DailyMeetingsFilters) {
  const query = useQuery({
    queryKey: ["daily-meetings", pipeline, dateFrom, dateTo, calendar],
    queryFn: ({ signal }) =>
      getDailyMeetingsReport({ pipeline, dateFrom, dateTo, calendar }, signal),
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const [sort, setSort] = useState<{
    key: "fechaReunion" | keyof DailyMeetingTotals;
    asc: boolean;
  }>({ key: "fechaReunion", asc: true });
  const [selected, setSelected] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const data = query.data;
  const days = data
    ? [...data.porDia].sort((a, b) => {
        const av = sort.key === "porcentajeAsistencia" ? meetingRate(a) : a[sort.key],
          bv = sort.key === "porcentajeAsistencia" ? meetingRate(b) : b[sort.key];
        if (av == null) return bv == null ? 0 : 1;
        if (bv == null) return -1;
        return (
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv))) * (sort.asc ? 1 : -1)
        );
      })
    : [];
  // Also bind selection to the active range, even if the caller forgets a key.
  const selectionKey = selected?.split("|");
  const day =
    selectionKey?.[0] === pipeline &&
    selectionKey[1] === dateFrom &&
    selectionKey[2] === dateTo &&
    selectionKey[4] === calendar
      ? data?.porDia.find((row) => row.fechaReunion === selectionKey[3])
      : undefined;
  const changeSort = (key: typeof sort.key) =>
    setSort((prev) => ({ key, asc: prev.key === key ? !prev.asc : true }));
  return (
    <section
      className="space-y-3"
      aria-labelledby="daily-meetings-heading"
      aria-busy={query.isFetching}
    >
      <h3 id="daily-meetings-heading" className="text-base font-semibold">
        Citas por fecha de reunión — {pipelineLabels[pipeline]}
      </h3>
      <p className="text-sm text-muted-foreground">
        Agendamientos agrupados por la fecha programada de reunión y clasificados según su estado
        actual en Calendar
      </p>
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando citas por fecha de reunión...
        </p>
      ) : query.isError ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>
            {query.error instanceof Error
              ? query.error.message
              : "No se pudo cargar el reporte diario de citas."}
          </p>
          <button
            type="button"
            className="text-brand hover:underline"
            onClick={() => query.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        data && (
          <>
            {query.isFetching && (
              <p role="status" className="text-xs text-muted-foreground">
                Actualizando citas...
              </p>
            )}
            {data.warnings.length > 0 && (
              <details className="text-xs text-amber-800">
                <summary className="cursor-pointer">
                  Advertencias de consistencia de la API ({data.warnings.length})
                </summary>
                <ul>
                  {data.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[1050px] text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <th
                      scope="col"
                      className="px-4 py-3 font-medium"
                      aria-sort={
                        sort.key === "fechaReunion"
                          ? sort.asc
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button type="button" onClick={() => changeSort("fechaReunion")}>
                        Fecha de reunión ↕
                      </button>
                    </th>
                    {countColumns.map(([key, label]) => (
                      <th
                        key={key}
                        scope="col"
                        className="px-4 py-3 font-medium"
                        aria-sort={
                          sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"
                        }
                      >
                        <button type="button" onClick={() => changeSort(key)}>
                          {label} ↕
                        </button>
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="px-4 py-3 font-medium"
                      aria-sort={
                        sort.key === "porcentajeAsistencia"
                          ? sort.asc
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button type="button" onClick={() => changeSort("porcentajeAsistencia")}>
                        % Asistencia ↕
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((row) => (
                    <tr
                      key={row.fechaReunion}
                      className="border-t border-border hover:bg-accent/50"
                    >
                      <td className="px-4 py-3">{dateLabel(row.fechaReunion)}</td>
                      {countColumns.map(([key]) => (
                        <td key={key} className="px-4 py-3 tabular-nums">
                          {row[key]}
                        </td>
                      ))}
                      <td className="px-4 py-3 tabular-nums">{rateLabel(row)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="font-medium text-brand hover:underline"
                          aria-haspopup="dialog"
                          aria-label={`Ver detalle del ${dateLabel(row.fechaReunion)}`}
                          onClick={(event) => {
                            trigger.current = event?.currentTarget ?? null;
                            setSelected(
                              `${pipeline}|${dateFrom}|${dateTo}|${row.fechaReunion}|${calendar}`,
                            );
                          }}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                  {days.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No hay citas en el período seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-brand-soft font-semibold">
                    <th scope="row" className="px-4 py-3 text-left">
                      TOTAL GENERAL
                    </th>
                    {countColumns.map(([key]) => (
                      <td key={key} className="px-4 py-3 tabular-nums">
                        {data.total[key]}
                      </td>
                    ))}
                    <td className="px-4 py-3 tabular-nums">{rateLabel(data.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )
      )}
      {day && !query.isError && (
        <MeetingDayModal
          key={`${pipeline}|${dateFrom}|${dateTo}|${day.fechaReunion}|${calendar}`}
          day={day}
          onClose={() => setSelected(null)}
          onRestoreFocus={() => trigger.current?.focus()}
        />
      )}
    </section>
  );
}
