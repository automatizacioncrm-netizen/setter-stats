import { z } from "zod";
import { normalizePersonKey } from "../../lib/report-team";
import type { ReportPerformance } from "../../types/reports";

const count = z.number().finite().int().nonnegative();
const attendance = z.object({
  agendamientos: count,
  citasAsistidas: count,
  asistenciaPct: z.number().finite().nullable(),
});
const schema = z.object({
  conversionPorCloser: z.array(
    z.object({
      closer: z.string().min(1),
      citasAsistidas: count,
      ventas: count,
      conversionPct: z.number().finite().nullable(),
    }),
  ),
  asistenciaPorSetter: z.array(attendance.and(z.object({ setter: z.string().min(1) }))),
  // Closer counts share the meeting-date cohort; Setter counts do not.
  asistenciaPorCloserTodosEmbudos: z.array(
    attendance
      .refine((row) => row.citasAsistidas <= row.agendamientos)
      .and(z.object({ closer: z.string().min(1) })),
  ),
  alcanceAsistencia: z.string().min(1),
  alcanceConversionCloser: z.string().min(1),
  diagnostics: z.object({
    citasLigIncluidasSoloEnActividad: count.optional(),
    citasUnicasActividad: count.optional(),
    citasUnicasActividadSetter: count.optional(),
    citasUnicasActividadCloser: count.optional(),
    ventasSinCitaAsistida: count.optional(),
    ventasAtribucionAmbigua: count.optional(),
    ventasUnicas: count.optional(),
    citasAsistidasUnicas: count.optional(),
    criterio: z.string().optional(),
  }),
});

/** Preserve the deployed contract; never turn missing metrics into zeros. */
export function mapPerformance(value: unknown): {
  performance?: ReportPerformance;
  performanceError?: string;
};
export function mapPerformance(
  value: unknown,
  reconciliation?: { setterAppointmentsTotal?: number },
): {
  performance?: ReportPerformance;
  performanceError?: string;
};
export function mapPerformance(
  value: unknown,
  reconciliation?: { setterAppointmentsTotal?: number },
): {
  performance?: ReportPerformance;
  performanceError?: string;
} {
  if (value == null) return { performanceError: "La API no entregó los indicadores de desempeño." };
  const result = schema.safeParse(value);
  if (!result.success)
    return { performanceError: "La API entregó indicadores incompletos o inconsistentes." };
  const p = result.data;
  const names = [
    p.conversionPorCloser.map((r) => r.closer),
    p.asistenciaPorSetter.map((r) => r.setter),
    p.asistenciaPorCloserTodosEmbudos.map((r) => r.closer),
  ];
  if (names.some((values) => new Set(values.map(normalizePersonKey)).size !== values.length)) {
    return {
      performanceError:
        "La API entregó filas repetidas de responsables; se requiere revisar sus agregados.",
    };
  }
  const d = p.diagnostics;
  const assigned = p.conversionPorCloser.reduce((sum, row) => sum + row.ventas, 0);
  const activity = p.asistenciaPorSetter.reduce((sum, row) => sum + row.agendamientos, 0);
  const expectedSetterAppointments =
    d.citasUnicasActividadSetter ??
    reconciliation?.setterAppointmentsTotal ??
    d.citasUnicasActividad;
  const closerActivity = p.asistenciaPorCloserTodosEmbudos.reduce(
    (sum, row) => sum + row.agendamientos,
    0,
  );
  if (
    (d.ventasUnicas != null &&
      d.ventasSinCitaAsistida != null &&
      d.ventasAtribucionAmbigua != null &&
      assigned + d.ventasSinCitaAsistida + d.ventasAtribucionAmbigua !== d.ventasUnicas) ||
    (expectedSetterAppointments != null && activity !== expectedSetterAppointments) ||
    (d.citasUnicasActividadCloser != null && closerActivity !== d.citasUnicasActividadCloser)
  ) {
    return {
      performanceError: "Los indicadores de desempeño no concilian con los totales de la API.",
    };
  }
  return { performance: p };
}
