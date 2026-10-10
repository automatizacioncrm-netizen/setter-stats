import type { SetterRow } from "../types/reports";
import { REPORT_SETTERS, normalizePersonKey, resolveTeamMember } from "./report-team";
export const normalizeSetterKey = normalizePersonKey;
export function getCanonicalSetterName(value: string): string | null {
  return resolveTeamMember(value, REPORT_SETTERS)?.name ?? null;
}
export function getSetterChartRows(rows: readonly SetterRow[]): SetterRow[] {
  return normalizeSetterRows(rows);
}
export function getSetterOptions(names: readonly string[], apiNormalized = false) {
  return REPORT_SETTERS.map((person) => {
    const sources = names.filter((name) => getCanonicalSetterName(name) === person.name);
    return {
      value: person.name as string,
      label: person.name,
      sourceNames: apiNormalized || sources.length === 0 ? [person.name] : sources,
    };
  });
}
const COUNT_KEYS = [
  "agendadoCRM",
  "confirmado",
  "asistio",
  "cancelado",
  "noShow",
  "pendienteAgenda",
  "reagendado",
  "total",
] as const;
export type NormalizedSetterRow = SetterRow & { sourceNames: string[] };
export function normalizeSetterRows(rows: readonly SetterRow[]): NormalizedSetterRow[] {
  return REPORT_SETTERS.map((person) => {
    const aggregate: NormalizedSetterRow = {
      setter: person.name,
      sourceNames: [],
      agendadoCRM: 0,
      confirmado: 0,
      asistio: 0,
      cancelado: 0,
      noShow: 0,
      pendienteAgenda: 0,
      reagendado: 0,
      total: 0,
    };
    const seenEffective = new Set<string>();
    for (const row of rows) {
      const source = row.setterEfectivo || row.agendadoPor || row.setter;
      if (getCanonicalSetterName(source) !== person.name) continue;
      // Repeated authoritative buckets must not double the same API aggregate.
      if (row.setterEfectivo !== undefined) {
        const key = normalizePersonKey(source);
        if (seenEffective.has(key)) continue;
        seenEffective.add(key);
      }
      if (!aggregate.sourceNames.includes(source)) aggregate.sourceNames.push(source);
      for (const key of COUNT_KEYS) {
        const value = Number(row[key] ?? 0);
        aggregate[key] = (aggregate[key] ?? 0) + (Number.isFinite(value) ? value : 0);
      }
    }
    return aggregate;
  });
}
