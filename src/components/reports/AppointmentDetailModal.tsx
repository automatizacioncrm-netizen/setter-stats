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
import { getAppointmentDetail } from "@/services/reports";
import type { AppointmentDetailFilters, AppointmentDetailRow } from "@/types/reports";

const columns: [keyof AppointmentDetailRow, string][] = [
  ["nombreContacto", "Nombre"],
  ["telefono", "Teléfono"],
  ["correo", "Correo"],
  ["agendadoPor", "Agendado por"],
  ["calendario", "Calendario"],
  ["estado", "Estado"],
  ["fechaCreacionCita", "Fecha creación cita"],
  ["fechaReunion", "Fecha reunión"],
  ["closer", "Closer"],
];

export function AppointmentDetailModal({
  selection,
  onClose,
}: {
  selection: { name: string; count: number; filters: AppointmentDetailFilters };
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["appointment-detail", selection.filters, page],
    queryFn: ({ signal }) => getAppointmentDetail(selection.filters, page, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error)
      console.error("No fue posible cargar el detalle de agendamientos.", query.error);
  }, [query.error]);
  const data = query.data;
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1);
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
              ? `${data.pagination.totalRecords} registros`
              : `Cifra seleccionada: ${selection.count}`}
            {selection.filters.status && ` · Estado: ${selection.filters.status}`}
          </DialogDescription>
        </DialogHeader>
        {query.isFetching ? (
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
              <p className="text-sm text-muted-foreground">
                Total: {data.summary.total} · Confirmado: {data.summary.confirmado} · Asistió:{" "}
                {data.summary.asistio}
                {` · Cancelado: ${data.summary.cancelado} · No asistió: ${data.summary.noShow} · Asistencia: ${data.summary.tasaAsistencia}%`}
              </p>
              {data.pagination.totalRecords !== selection.count && (
                <p role="status" className="text-sm text-muted-foreground">
                  La API devuelve {data.pagination.totalRecords} registros para la cifra
                  seleccionada ({selection.count}).
                </p>
              )}
              {data.rows.length === 0 ? (
                <p>No se encontraron agendamientos para los filtros seleccionados.</p>
              ) : (
                <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[1200px] text-sm">
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
                      {data.rows.map((row, index) => (
                        <tr
                          key={row.appointmentId || `${page}-${index}`}
                          className="border-t border-border"
                        >
                          {columns.map(([key]) => (
                            <td key={key} className="px-3 py-2 align-top">
                              {row[key] || "—"}
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
            disabled={query.isFetching || page <= 1}
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
            disabled={query.isFetching || !data || page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
