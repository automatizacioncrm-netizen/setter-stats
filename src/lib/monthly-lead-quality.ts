import { rangePeriod } from "./vsl-date-range";
type Cell = string | number | null;
type Kind = "vsl" | "funnel";
const names = [
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
const aliases = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP|SET|SETIEMBRE",
  "OCT",
  "NOV",
  "DIC",
];
function period(value: Cell) {
  const raw = String(value ?? "").trim();
  const range = rangePeriod(raw);
  // A single aggregate spanning months cannot be redistributed without raw data.
  if (range && range.startDate.slice(0, 7) !== range.endDate.slice(0, 7))
    return { key: range.endDate, label: raw, cut: null, opaque: true };
  const text = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const iso = text.match(/^(\d{4})-(0[1-9]|1[0-2])(?:$|[-T ])/);
  const month = range
    ? Number(range.startDate.slice(5, 7)) - 1
    : iso
      ? Number(iso[2]) - 1
      : names.findIndex((name, index) =>
          new RegExp("\\b(?:" + name + "|" + aliases[index] + ")\\b").test(text),
        );
  if (month < 0) return { key: raw, label: raw, cut: null, opaque: true };
  const year = range?.startDate.slice(0, 4) ?? iso?.[1] ?? text.match(/\b(\d{4})\b/)?.[1] ?? "2026";
  const days = text.match(/\b(?:DEL\s+)?(\d{1,2})\s+AL\s+(\d{1,2})\b/);
  const cut = range
    ? [Number(range.startDate.slice(8)), Number(range.endDate.slice(8))]
    : days
      ? [Number(days[1]), Number(days[2])]
      : null;
  if (
    cut &&
    (cut[0]! < 1 ||
      cut[0]! > cut[1]! ||
      cut[1]! > new Date(Date.UTC(Number(year), month + 1, 0)).getUTCDate())
  )
    throw new Error("El período de calidad contiene días inválidos.");
  return {
    key: year + "-" + String(month + 1).padStart(2, "0"),
    label: names[month]!,
    cut,
    opaque: false,
  };
}
/** Display-only fallback. Monthly server rows win; percentages are rebuilt only when summing cuts. */
export function monthlyLeadRows(input: readonly (readonly Cell[])[], kind: Kind): Cell[][] {
  const groups = new Map<string, { row: readonly Cell[]; period: ReturnType<typeof period> }[]>();
  input.forEach((row) => {
    const parsed = period(row[0] ?? null);
    const group = groups.get(parsed.key) ?? [];
    group.push({ row, period: parsed });
    groups.set(parsed.key, group);
  });
  const duplicateLabels = new Set<string>();
  const labels = new Set<string>();
  for (const group of groups.values()) {
    const p = group[0]!.period;
    if (!p.opaque) {
      if (labels.has(p.label)) duplicateLabels.add(p.label);
      labels.add(p.label);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, group]) => {
      const parsed = group[0]!.period;
      const label = duplicateLabels.has(parsed.label)
        ? parsed.label + " " + parsed.key.slice(0, 4)
        : parsed.label;
      if (parsed.opaque) {
        if (group.length > 1)
          throw new Error("No se pueden consolidar períodos de calidad sin un mes identificable.");
        return [...group[0]!.row];
      }
      const monthly = group.filter(
        (item) =>
          !item.period.cut ||
          (item.period.cut[0] === 1 &&
            item.period.cut[1] ===
              new Date(
                Date.UTC(Number(item.period.key.slice(0, 4)), Number(item.period.key.slice(5)), 0),
              ).getUTCDate()),
      );
      if (monthly.length > 1)
        throw new Error(
          "La API contiene más de un agregado mensual para el mismo mes; no se duplican sus datos.",
        );
      if (monthly.length === 1) return [label, ...monthly[0]!.row.slice(1)];
      if (group.length === 1) return [label, ...group[0]!.row.slice(1)];
      const ordered = [...group].sort((a, b) => a.period.cut![0]! - b.period.cut![0]!);
      for (let i = 1; i < ordered.length; i++)
        if (ordered[i]!.period.cut![0]! <= ordered[i - 1]!.period.cut![1]!)
          throw new Error(
            "Los rangos de calidad se superponen; no se suman para evitar duplicaciones.",
          );
      const ratios =
        kind === "vsl"
          ? [
              [3, 2, 1],
              [5, 4, 1],
              [8, 7, 6],
              [10, 9, 1],
            ]
          : [
              [4, 3, 2],
              [6, 5, 1],
            ];
      const ratioColumns = new Set(ratios.map(([column]) => column!));
      const result: Cell[] = [label];
      for (let column = 1; column < group[0]!.row.length; column++) {
        if (ratioColumns.has(column)) {
          result[column] = 0;
          continue;
        }
        result[column] = group.reduce((sum, item) => {
          const value = item.row[column];
          if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
            throw new Error("No se pueden sumar conteos de calidad ausentes o inválidos.");
          return sum + value;
        }, 0);
      }
      for (const [column, numerator, denominator] of ratios)
        result[column!] = Number(result[denominator!])
          ? Number(result[numerator!]) / Number(result[denominator!])
          : 0;
      return result;
    });
}
export function presentMonthlyLeadRows(input: readonly (readonly Cell[])[], kind: Kind) {
  try {
    return { rows: monthlyLeadRows(input, kind), error: undefined };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : "No se pudo consolidar el reporte mensual.",
    };
  }
}
