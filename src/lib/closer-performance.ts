import { ratio } from "./executive-metrics";
import { normalizePersonKey } from "./report-team";

type AttendanceRow = { closer: string; agendamientos: number; citasAsistidas: number };
type ConversionRow = { closer: string; ventas: number; citasAsistidas: number };

/** Full union of the existing presentation rows, with each metric's original denominator. */
export function joinCloserPerformance(
  attendance: readonly AttendanceRow[],
  conversion: readonly ConversionRow[],
) {
  const people = new Map<string, { attendance?: AttendanceRow; conversion?: ConversionRow }>();
  for (const row of attendance) {
    const key = normalizePersonKey(row.closer);
    people.set(key, { ...people.get(key), attendance: row });
  }
  for (const row of conversion) {
    const key = normalizePersonKey(row.closer);
    people.set(key, { ...people.get(key), conversion: row });
  }
  return [...people].map(([key, sources]) => {
    const a = sources.attendance;
    const c = sources.conversion;
    return {
      key,
      closer: a?.closer ?? c!.closer,
      agendamientos: a?.agendamientos ?? null,
      citasAsistidas: a?.citasAsistidas ?? c!.citasAsistidas,
      asistenciaPct: a ? ratio(a.citasAsistidas, a.agendamientos) : null,
      ventas: c?.ventas ?? 0,
      conversionPct: c ? ratio(c.ventas, c.citasAsistidas) : 0,
      conversionCitasAsistidas: c?.citasAsistidas ?? null,
    };
  });
}
