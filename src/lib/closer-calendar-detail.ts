import type { AppointmentDetailRow, ReportFilters } from "../types/reports";
import { appointmentDetailFilters } from "../services/reports";

export function closerCalendarFilters(filters: ReportFilters) {
  return { ...appointmentDetailFilters(filters), dateField: "meetingDate" as const };
}

export function groupCloserCalendar(rows: AppointmentDetailRow[]) {
  const seen = new Set<string>();
  const groups = new Map<
    string,
    {
      closer: string;
      confirmado: number;
      asistio: number;
      cancelado: number;
      noAsistio: number;
      totalCitas: number;
    }
  >();
  const keys = {
    Confirmado: "confirmado",
    Asistió: "asistio",
    Cancelado: "cancelado",
    "No asistió": "noAsistio",
  } as const;
  for (const row of rows) {
    if (!row.estado || !Object.prototype.hasOwnProperty.call(keys, row.estado)) continue;
    const id = row.appointmentId?.trim();
    if (!id) throw new Error("Falta Appointment ID en el detalle de citas.");
    if (seen.has(id)) continue;
    seen.add(id);
    const closer = row.closer || "Sin closer identificado";
    const group = groups.get(closer) ?? {
      closer,
      confirmado: 0,
      asistio: 0,
      cancelado: 0,
      noAsistio: 0,
      totalCitas: 0,
    };
    group[keys[row.estado as keyof typeof keys]]++;
    group.totalCitas++;
    groups.set(closer, group);
  }
  const visible = [...groups.values()].sort((a, b) => a.closer.localeCompare(b.closer));
  const totals = visible.reduce(
    (sum, row) => ({
      closer: "Total equipo visible",
      confirmado: sum.confirmado + row.confirmado,
      asistio: sum.asistio + row.asistio,
      cancelado: sum.cancelado + row.cancelado,
      noAsistio: sum.noAsistio + row.noAsistio,
      totalCitas: sum.totalCitas + row.totalCitas,
    }),
    {
      closer: "Total equipo visible",
      confirmado: 0,
      asistio: 0,
      cancelado: 0,
      noAsistio: 0,
      totalCitas: 0,
    },
  );
  return { rows: visible, totals };
}
