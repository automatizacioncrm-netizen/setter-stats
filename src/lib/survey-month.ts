const MONTHS_ES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];
// Month names without a year belong to the configured historical report (2026).
export function normalizeSurveyMonth(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  const match = raw.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-|T|$)/);
  if (match) return `${match[1]}-${match[2]}`;
  const index = MONTHS_ES.indexOf(raw.toUpperCase());
  return index < 0 ? raw : `2026-${String(index + 1).padStart(2, "0")}`;
}
export function formatSurveyMonth(value: unknown): string {
  const normalized = normalizeSurveyMonth(value);
  const match = normalized.match(/^\d{4}-(0[1-9]|1[0-2])$/);
  return match ? (MONTHS_ES[Number(match[1]) - 1] ?? normalized) : normalized;
}
const STATES = ["CONFIRMADO", "ASISTIO", "CANCELADO", "NO ASISTIO", "OTRO"];
function stateOrder(value: unknown): number {
  const state = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const index = STATES.indexOf(state);
  return index < 0 ? STATES.length : index;
}
export function groupSurveyRows<T extends readonly unknown[]>(rows: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeSurveyMonth(row[0]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const aDate = /^\d{4}-\d{2}$/.test(a),
      bDate = /^\d{4}-\d{2}$/.test(b);
    return aDate && bDate ? b.localeCompare(a) : aDate ? -1 : bDate ? 1 : 0;
  });
  return keys.flatMap((key) => {
    // Sort a copied group; keep duplicate states as independent original rows.
    const group = [...(groups.get(key) ?? [])].sort((a, b) => stateOrder(a[1]) - stateOrder(b[1]));
    return group.map((row, index) => ({
      row,
      monthRowSpan: index === 0 ? group.length : 0,
      monthLabel: index === 0 ? formatSurveyMonth(key) : "",
      endOfMonth: index === group.length - 1,
    }));
  });
}
