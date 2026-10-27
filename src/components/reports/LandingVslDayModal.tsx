import { useState } from "react";
import type { LandingVslDay, LandingVslLeadDetail } from "@/types/reports";
import { formatSaleQuotaDate } from "@/lib/sales-detail";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ExecutiveTable } from "./ExecutiveTable";

const dateLabel = (value: string) => (value ? formatSaleQuotaDate(value) : "—");
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
function searchLandingVslDetails(rows: readonly LandingVslLeadDetail[], search: string) {
  const query = normalize(search.trim());
  if (!query) return rows;
  return rows.filter((row) =>
    [row.nombreContacto, row.correo, row.telefono].some((value) =>
      normalize(value).includes(query),
    ),
  );
}

const badgeColors = {
  Asistió: "bg-emerald-50 text-emerald-800",
  "No asistió": "bg-red-50 text-red-800",
  "Sin resultado": "bg-muted text-muted-foreground",
  Confirmado: "bg-blue-50 text-blue-800",
  Cancelado: "bg-amber-50 text-amber-800",
};

export function LandingVslDayModal({
  day,
  onClose,
  onRestoreFocus,
}: {
  day: LandingVslDay;
  onClose: () => void;
  onRestoreFocus?: (() => void) | undefined;
}) {
  const [search, setSearch] = useState("");
  const rows =
    day.detalles === undefined ? undefined : searchLandingVslDetails(day.detalles, search);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-7xl overflow-y-auto rounded-lg bg-surface"
        onEscapeKeyDown={() => onClose()}
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Detalle de leads — {dateLabel(day.fecha)}</DialogTitle>
          <DialogDescription>{day.totalLeads} leads creados en esta fecha</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Total de leads", day.totalLeads],
              ["Total agendados", day.oportunidadesConCita ?? "No disponible"],
              ["Confirmados", day.confirmados ?? "No disponible"],
              ["Cancelados", day.cancelados ?? "No disponible"],
              ["Asistidos", day.leadsAsistidos],
              ["No asistidos", day.leadsNoAsistidos],
              ["Sin resultado", day.leadsPendientesResultado],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        {rows === undefined ? (
          <p role="status" className="text-sm text-muted-foreground">
            La API entrega el resumen de este día, pero no sus registros individuales (detalles).
          </p>
        ) : (
          <>
            <label className="space-y-1 text-sm">
              <span>Buscar por nombre, correo o teléfono</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <p role="status" className="text-xs text-muted-foreground">
              {rows.length} de {day.totalLeads} leads
            </p>
            <ExecutiveTable
              rows={rows}
              rowKey={(row) => row.opportunityId}
              empty={
                search.trim()
                  ? "No hay leads que coincidan con la búsqueda."
                  : "No hay leads creados en esta fecha."
              }
              minWidth="min-w-[1400px]"
              columns={[
                {
                  key: "name",
                  label: "Nombre del contacto",
                  value: (row) => row.nombreContacto || "No registrado",
                },
                {
                  key: "phone",
                  label: "Teléfono",
                  value: (row) => row.telefono || "No registrado",
                },
                {
                  key: "email",
                  label: "Correo electrónico",
                  value: (row) => row.correo || "No registrado",
                },
                {
                  key: "state",
                  label: "Estado consolidado",
                  value: (row) => row.estadoConsolidado ?? row.estado,
                  render: (row) => (
                    <div className="space-y-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${badgeColors[row.estadoConsolidado ?? row.estado]}`}
                      >
                        {row.estadoConsolidado ?? row.estado}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "created",
                  label: "Fecha de creación",
                  value: (row) => row.fechaCreacionOportunidad ?? row.fechaCreacion,
                  render: (row) => dateLabel(row.fechaCreacionOportunidad ?? row.fechaCreacion),
                },
                {
                  key: "meeting",
                  label: "Fecha de reunión",
                  value: (row) => row.fechaReunion,
                  render: (row) =>
                    row.tieneCita === false ||
                    (row.tieneCita === undefined && row.citas.length === 0)
                      ? "Sin cita"
                      : dateLabel(row.fechaReunion),
                },
                {
                  key: "setter",
                  label: "Setter",
                  value: (row) => row.setterAsignado || row.setterOpportunity || "No registrado",
                },
                {
                  key: "closer",
                  label: "Closer",
                  value: (row) => row.closerAsignado || row.closerOpportunity || "No registrado",
                },
                {
                  key: "appointments",
                  label: "Número de citas",
                  value: (row) => row.numeroCitas ?? null,
                  render: (row) => row.numeroCitas ?? "No disponible",
                },
                {
                  key: "history",
                  label: "Acción",
                  value: (row) => row.opportunityId,
                  render: (row) =>
                    row.citas.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-brand">
                          Ver citas ({row.citas.length})
                        </summary>
                        <ul className="mt-2 space-y-2 text-xs">
                          {row.citas.map((cita) => (
                            <li
                              key={cita.appointmentId}
                              className="rounded border border-border p-2"
                            >
                              <p>Fecha de reunión: {dateLabel(cita.fechaReunion)}</p>
                              <p>
                                Fecha de creación de cita:{" "}
                                {dateLabel(
                                  cita.fechaCreacionCita || cita.appointmentCreatedAt || "",
                                )}
                              </p>
                              <p>Calendario: {cita.calendarioCita || "No registrado"}</p>
                              <p>
                                Estado de cita:{" "}
                                {cita.estadoConsolidado ||
                                  cita.estadoAgenda ||
                                  cita.estado ||
                                  cita.estadoCita ||
                                  "No registrado"}
                              </p>
                              {cita.estadoCita && <p>Estado Calendar: {cita.estadoCita}</p>}
                              <p>
                                Setter o creador:{" "}
                                {cita.setterAsignado ||
                                  cita.creadorCita ||
                                  cita.agendadorCita ||
                                  "No registrado"}
                              </p>
                              <p>
                                Closer: {cita.closerAsignado || cita.closerCita || "No registrado"}
                              </p>
                              <p className="text-muted-foreground">
                                Appointment ID: {cita.appointmentId}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      "Sin cita"
                    ),
                },
              ]}
            />
          </>
        )}
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
