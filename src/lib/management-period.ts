import {
  limaDay,
  monthOfYear,
  rangeForPreset,
  rangePeriod,
  type DatePreset,
  type DateRange,
} from "./vsl-date-range";

export type ManagementPeriod = { label: string; from: string; to: string };

export function managementPeriods(
  periods: readonly ManagementPeriod[],
  cutoff: string,
  today: string,
) {
  const ordered = [...periods].sort((a, b) => b.from.localeCompare(a.from));
  if (cutoff > today || ordered[0]?.to !== cutoff || ordered.at(-1)?.from !== "2026-07-01")
    throw new Error("El histórico de Gerencia no confirma un corte válido desde julio de 2026.");

  for (const [index, period] of ordered.entries()) {
    const year = Number(period.from.slice(0, 4));
    const month = Number(period.from.slice(5, 7));
    const full = monthOfYear(year, month);
    if (
      period.from !== full.startDate ||
      period.to !== (index === 0 ? cutoff : full.endDate) ||
      period.to < period.from ||
      period.to > full.endDate ||
      (index > 0 && ordered[index - 1]?.from !== monthOfYear(year, month + 1).startDate)
    )
      throw new Error("El histórico de Gerencia contiene períodos mensuales incompatibles.");
  }
  return ordered;
}

export function managementRange(preset: DatePreset, custom?: DateRange, now = new Date()) {
  const range = rangeForPreset(preset, custom, now);
  if (!range) return undefined;
  const today = limaDay(now);
  if (preset === "custom" && range.endDate > today)
    throw new Error("La fecha final no puede ser posterior a hoy en Lima.");
  if (range.startDate > today) throw new Error("No se pueden consultar períodos futuros.");
  return { startDate: range.startDate, endDate: range.endDate > today ? today : range.endDate };
}

export function orderManagementRows<T>(
  rows: readonly (readonly T[])[],
  periods: readonly ManagementPeriod[],
) {
  const indexed = rows.map((row) => {
    const value = String(row[0] ?? "").trim();
    const explicit = rangePeriod(value);
    const month = value.match(/^\d{4}-\d{2}(?=$|[-T])/)?.[0];
    const matches = periods.filter(({ label, from, to }) =>
      explicit
        ? explicit.startDate === from && explicit.endDate === to
        : month
          ? from.startsWith(month)
          : value === label || value === `${label} ${from.slice(0, 4)}`,
    );
    if (matches.length !== 1)
      throw new Error(
        "Una fila del histórico no se puede asociar a un período confirmado por la API.",
      );
    const { from, to } = matches[0]!;
    return { from, row: [`${from} / ${to}`, ...row.slice(1)] };
  });
  return indexed.sort((a, b) => b.from.localeCompare(a.from)).map(({ row }) => row);
}
