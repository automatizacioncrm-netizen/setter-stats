export const REPORT_SETTERS = [
  { id: "alvaro", name: "Alvaro Jesus Paniura Marin", aliases: ["Alvaro"] },
  { id: "jose", name: "Jose Luis Botto Garcia", aliases: ["Jose", "Jose Luis"] },
  { id: "claudia", name: "Claudia Jimena Ocampo Portilla", aliases: ["Jimena", "Claudia Jimena"] },
  { id: "cinthia", name: "Cinthia Maquito", aliases: ["Cinthia"] },
  { id: "evelyn", name: "Evelyn Lopez Horna", aliases: ["Evelyn", "Evelyn Lopez"] },
  { id: "kiara", name: "Kiara Villadolid Huamantumba", aliases: ["Kiara"] },
] as const;
export const REPORT_CLOSER_TEAM = [
  { id: "fiorela", name: "Fiorela Bernales", aliases: [] },
  { id: "ezequiel", name: "Ezequiel Dario", aliases: [] },
  { id: "amaranta", name: "Amaranta Alfonso Krasnova", aliases: [] },
] as const;
export type TeamMember = {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
};
export function normalizePersonKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
export function resolveTeamMember(value: string, team: readonly TeamMember[]) {
  const key = normalizePersonKey(value);
  return (
    team.find((person) =>
      [person.name, ...person.aliases].some((name) => normalizePersonKey(name) === key),
    ) ?? null
  );
}
/** API buckets contain disjoint unique events. Canonicalize buckets, never assign unknown people. */
export function teamPerformanceRows<T extends { citasAsistidas: number }>(
  rows: readonly T[],
  team: readonly TeamMember[],
  name: (row: T) => string,
  count: (row: T) => number,
) {
  return team.map((person) => {
    const matches = rows.filter((row) => resolveTeamMember(name(row), team)?.id === person.id);
    return {
      id: person.id,
      name: person.name,
      citasAsistidas: matches.reduce((sum, row) => sum + row.citasAsistidas, 0),
      count: matches.reduce((sum, row) => sum + count(row), 0),
    };
  });
}
