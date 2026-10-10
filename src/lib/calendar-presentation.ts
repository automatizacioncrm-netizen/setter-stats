import type { ReportKpis, VslClosersReport } from "../types/reports";
import { getCanonicalSetterName, getVisibleSetterRows } from "./setter-performance";
import { ratio } from "./executive-metrics";
/** Reuse API Calendar status buckets. Never infer missing distributions from performance totals. */
export function calendarPresentation(report: VslClosersReport, selectedSetter = "") {
  const rows = getVisibleSetterRows(report.setters, selectedSetter);
  const selected = getCanonicalSetterName(selectedSetter);
  const kpis: ReportKpis = selected
    ? rows.reduce(
        (sum, row) => ({
          ...sum,
          total: sum.total + row.total,
          confirmado: (sum.confirmado ?? 0) + (row.confirmado ?? 0),
          asistio: sum.asistio + row.asistio,
          cancelado: sum.cancelado + row.cancelado,
          noShow: sum.noShow + row.noShow,
          agendadoCRM: sum.agendadoCRM + row.agendadoCRM,
          pendienteAgenda: sum.pendienteAgenda + row.pendienteAgenda,
          reagendado: sum.reagendado + row.reagendado,
        }),
        {
          ...report.kpis,
          total: 0,
          confirmado: 0,
          asistio: 0,
          cancelado: 0,
          noShow: 0,
          agendadoCRM: 0,
          pendienteAgenda: 0,
          reagendado: 0,
        },
      )
    : { ...report.kpis };
  if (selected) {
    kpis.tasaAsistencia = ratio(kpis.asistio, kpis.total) ?? 0;
    kpis.tasaNoShow = ratio(kpis.noShow, kpis.total) ?? 0;
  }
  let error: string | undefined;
  const performance = report.performance;
  const expected = selected
    ? performance?.asistenciaPorSetter
        .filter((row) => getCanonicalSetterName(row.setter) === selected)
        .reduce((sum, row) => sum + row.agendamientos, 0)
    : performance?.diagnostics.citasUnicasActividad;
  const total = selected ? kpis.total : report.setters.reduce((sum, row) => sum + row.total, 0);
  if (report.performanceError || expected == null)
    error = "La API no permite verificar el alcance de los estados de Calendar.";
  else if (total !== expected)
    error = `La API entrega ${expected} citas de actividad, pero el desglose de estados disponible cubre ${total}. No hay información suficiente para graficar este alcance.`;
  else if (
    selected &&
    performance?.asistenciaPorSetter
      .filter((row) => getCanonicalSetterName(row.setter) === selected)
      .reduce((sum, row) => sum + row.citasAsistidas, 0) !== kpis.asistio
  )
    error = "Las asistencias por setter no concilian con el desglose de estados recibido.";
  return { rows, kpis, error, selectedSetter: selected || "" };
}
