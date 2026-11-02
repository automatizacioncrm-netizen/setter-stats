import { limaDay, rangeLabel, type DatePreset, type DateRange } from "@/lib/vsl-date-range";
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
export function VslDateFilter({
  preset,
  start,
  end,
  onPreset,
  onStart,
  onEnd,
  onApply,
  onClear,
  error,
  activeRange,
}: {
  preset: DatePreset;
  start: string;
  end: string;
  onPreset: (value: DatePreset) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  error: string;
  activeRange?: DateRange | undefined;
}) {
  const year = Number(limaDay().slice(0, 4));
  return (
    <section
      aria-label="Filtro global de fechas"
      className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Período
          <select
            value={preset}
            onChange={(e) => onPreset(e.target.value as DatePreset)}
            className="rounded-lg border border-border bg-background px-3 py-2"
          >
            {[
              ["all", "Todo el histórico"],
              ["today", "Hoy"],
              ["yesterday", "Ayer"],
              ["thisWeek", "Esta semana"],
              ["lastWeek", "Semana anterior"],
              ["thisMonth", "Este mes"],
              ["lastMonth", "Mes anterior"],
              ["custom", "Rango personalizado"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <optgroup label={`MESES DE ${year}`}>
              {MONTHS.map((month, i) => (
                <option key={month} value={`month:${i + 1}`}>
                  {month} {year}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Fecha inicial
              <input
                type="date"
                value={start}
                onChange={(e) => onStart(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Fecha final
              <input
                type="date"
                value={end}
                onChange={(e) => onEnd(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <button
              onClick={onApply}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              Aplicar filtro
            </button>
          </>
        )}
        <button onClick={onClear} className="rounded-lg border border-border px-4 py-2 text-sm">
          Limpiar filtro
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Período aplicado a ambas tablas: <strong>{rangeLabel(activeRange)}</strong>
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
