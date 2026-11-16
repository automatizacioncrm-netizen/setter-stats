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

const HIDDEN_CLOSERS = new Set(["Essika Morales", "Cinthia Maquito"]);

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
  closer,
  closers,
  onCloser,
  closerPeriod,
  closerStatus,
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
  closer: string;
  closers: readonly { closer: string }[];
  onCloser: (closer: string) => void;
  closerPeriod: string;
  closerStatus?: string | undefined;
}) {
  return (
    <section
      aria-label="Filtro global de fechas"
      className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-sm font-medium">
          <label htmlFor="vsl-report-period">Período</label>
          <Select
            value={preset}
            disabled={!!closer}
            onValueChange={(value) => onPreset(value as DatePreset)}
          >
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
        <div className="flex min-w-0 max-w-full flex-col gap-1 text-sm font-medium">
          <label htmlFor="vsl-report-closer">Closer</label>
          <Select
            value={closer ? "closer:" + closer : "all"}
            onValueChange={(value) =>
              onCloser(value === "all" ? "" : value.slice("closer:".length))
            }
          >
            <SelectTrigger
              id="vsl-report-closer"
              className="min-h-9 w-72 max-w-full gap-2 rounded-lg border-border bg-background [&>span]:truncate"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="max-w-[calc(100vw-2rem)] rounded-lg border-border"
            >
              <SelectItem value="all">Todos</SelectItem>
              {closers
                .filter(({ closer: name }) => !HIDDEN_CLOSERS.has(name))
                .map(({ closer: name }) => (
                  <SelectItem key={name} value={"closer:" + name} className="break-words">
                    {name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {!closer && preset === "custom" && (
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
        Período aplicado a las tablas:{" "}
        <strong>{closer ? closerPeriod : rangeLabel(activeRange)}</strong>
      </p>
      {closerStatus && <p className="break-words text-sm text-muted-foreground">{closerStatus}</p>}
      {!closer && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
