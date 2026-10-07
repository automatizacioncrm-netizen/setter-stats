import type { SetterRow } from "../types/reports";

const SETTER_ALIASES: Record<string, string> = {
  alvaro: "Alvaro Jesus Paniura Marin",
  "alvaro jesus paniura marin": "Alvaro Jesus Paniura Marin",
  "jose luis": "Jose Luis Botto Garcia",
  "jose luis botto garcia": "Jose Luis Botto Garcia",
  jimena: "Claudia Jimena Ocampo Portilla",
  "claudia jimena ocampo portilla": "Claudia Jimena Ocampo Portilla",
  cinthia: "Cinthia Maquito",
  "cinthia maquito": "Cinthia Maquito",
  evelyn: "Evelyn Lopez Horna",
  "evelyn lopez horna": "Evelyn Lopez Horna",
  kiara: "Kiara",
  "sin setter": "Sin setter",
};

export function normalizeSetterKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function getCanonicalSetterName(value: string): string | null {
  const key = normalizeSetterKey(value);
  return Object.hasOwn(SETTER_ALIASES, key) ? (SETTER_ALIASES[key] ?? null) : null;
}

/** Limit the chart to the setter team without changing API counts or names. */
export function getSetterChartRows(rows: readonly SetterRow[]): SetterRow[] {
  return rows
    .map((row) => ({ ...row, setter: row.setterEfectivo || row.agendadoPor || row.setter }))
    .filter((row) => {
      const canonical = getCanonicalSetterName(row.setter);
      return (
        (canonical !== null && canonical !== "Sin setter") ||
        normalizeSetterKey(row.setter) === "kiara villadolid huamantumba"
      );
    });
}

export function getSetterOptions(names: readonly string[], apiNormalized = false) {
  const grouped = new Map<string, { value: string; label: string; sourceNames: string[] }>();
  for (const name of names) {
    const canonical = apiNormalized ? name || "Sin setter" : getCanonicalSetterName(name);
    if (!canonical) continue;
    const option = grouped.get(canonical) ?? {
      value: canonical,
      label: canonical,
      sourceNames: [],
    };
    if (!option.sourceNames.includes(name)) option.sourceNames.push(name);
    grouped.set(canonical, option);
  }
  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
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
  const grouped = new Map<string, NormalizedSetterRow>();
  for (const row of rows) {
    if (row.setterEfectivo !== undefined) {
      const setter = row.setterEfectivo || row.agendadoPor || "Sin setter";
      // API aggregates already count unique Appointment IDs. Do not sum aliases again.
      grouped.set(setter, { ...row, setter, sourceNames: [setter] });
      continue;
    }
    const sourceName = row.setter || "Sin setter";
    const setter = getCanonicalSetterName(sourceName);
    if (!setter) continue;
    let aggregate = grouped.get(setter);
    if (!aggregate) {
      aggregate = {
        setter,
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
      grouped.set(setter, aggregate);
    }
    if (!aggregate.sourceNames.includes(sourceName)) aggregate.sourceNames.push(sourceName);
    for (const key of COUNT_KEYS) {
      const count = Number(row[key] ?? 0);
      aggregate[key] = (aggregate[key] ?? 0) + (Number.isFinite(count) ? count : 0);
    }
  }
  return [...grouped.values()].filter((row) => row.total > 0);
}
