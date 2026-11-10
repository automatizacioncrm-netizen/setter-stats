import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rangeLabel, type DatePreset, type DateRange } from "@/lib/vsl-date-range";
import type { ManagementPeriod } from "@/lib/management-period";

const QUICK_RANGES = [
  ["today", "Hoy"],
  ["yesterday", "Ayer"],
  ["thisWeek", "Esta semana"],
  ["lastWeek", "Semana anterior"],
  ["thisMonth", "Este mes"],
  ["lastMonth", "Mes anterior"],
  ["custom", "Rango personalizado"],
] as const;
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
  periods,
  today,
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
  periods: readonly ManagementPeriod[];
  today: string;
}) {
  return (
    <section
      aria-label="Filtro global de fechas"
      className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-sm font-medium">
          <label htmlFor="vsl-report-period">Período</label>
          <Select value={preset} onValueChange={(value) => onPreset(value as DatePreset)}>
            <SelectTrigger
              id="vsl-report-period"
              className="min-h-9 w-52 gap-2 rounded-lg border-border bg-background"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" className="rounded-lg border-border">
              <SelectItem value="all">Todo</SelectItem>
              {!!periods.length && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground">MESES</SelectLabel>
                    {periods.map(({ label, from }) => {
                      const year = from.slice(0, 4);
                      const month = Number(from.slice(5, 7));
                      return (
                        <SelectItem key={from} value={`month:${month}:${year}`}>
                          {label.includes(year) ? label : `${label} ${year}`}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </>
              )}
              <SelectSeparator />
              {QUICK_RANGES.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Fecha inicial
              <input
                type="date"
                max={today}
                value={start}
                onChange={(e) => onStart(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Fecha final
              <input
                type="date"
                max={today}
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
        Período aplicado a las tablas: <strong>{rangeLabel(activeRange)}</strong>
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
