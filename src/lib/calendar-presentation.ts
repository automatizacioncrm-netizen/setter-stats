import type { ReportKpis, VslClosersReport } from "../types/reports";
import { getCanonicalSetterName, getVisibleSetterRows } from "./setter-performance";
import { ratio } from "./executive-metrics";
/** Reuse API Calendar status buckets. Never infer missing distributions from performance totals. */
export function calendarPresentation(report: VslClosersReport, selectedSetter = "") {
  const rows = getVisibleSetterRows(report.setters, selectedSetter).map((row) => ({
    ...row,
    total: [row.confirmado, row.asistio, row.cancelado, row.noShow].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
      ? (row.confirmado ?? 0) +
          row.asistio +
          row.cancelado +
          row.noShow +
          row.agendadoCRM +
          row.pendienteAgenda +
          row.reagendado || row.total
      : row.total,
  }));
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
  const available =
    report.calendarStatusesAvailable ??
    [report.kpis.confirmado, report.kpis.asistio, report.kpis.cancelado, report.kpis.noShow].every(
      (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
    );
  // Calendar buckets have their own scope; performance uses different dates/states.
  if (available) {
    if (!selected || report.filters?.setter || report.filters?.booker)
      Object.assign(kpis, report.kpis);
    kpis.total =
      (kpis.confirmado ?? 0) +
      kpis.asistio +
      kpis.cancelado +
      kpis.noShow +
      kpis.agendadoCRM +
      kpis.pendienteAgenda +
      kpis.reagendado;
    kpis.tasaAsistencia = ratio(kpis.asistio, kpis.total) ?? 0;
    kpis.tasaNoShow = ratio(kpis.noShow, kpis.total) ?? 0;
  } else error = "La API no permite verificar el alcance de los estados de Calendar.";
  if (
    selected &&
    !report.filters?.setter &&
    !report.filters?.booker &&
    !report.setters.some((row) => getCanonicalSetterName(row.setter) === selected)
  )
    error = "La API no entregó el desglose de Calendar del responsable seleccionado.";
  return { rows, kpis, error, selectedSetter: selected || "" };
}
