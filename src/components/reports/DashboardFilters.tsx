import { RotateCcw } from "lucide-react";
import { type DatePreset, type ReportFilters } from "@/types/reports";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "todos", label: "Todo" },
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "mes", label: "Este mes" },
  { value: "custom", label: "Rango personalizado" },
];
const CALENDAR_STATUSES = ["Confirmado", "Asistió", "No asistió", "Cancelado"];

interface Props {
  filters: ReportFilters;
  setters: string[];
  bookers: string[];
  closers: string[];
  origins: string[];
  calendars: string[];
  onChange: (next: Partial<ReportFilters>) => void;
  onPreset: (preset: DatePreset) => void;
  onClear: () => void;
}

const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function DashboardFilters({
  filters,
  setters,
  bookers,
  closers,
  origins,
  calendars,
  onChange,
  onPreset,
  onClear,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="block w-full max-w-xs">
          <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
            Embudo
          </span>
          <select
            className={fieldClass}
            value={filters.pipeline ?? "all"}
            onChange={(e) => onChange({ pipeline: e.target.value as "all" | "vsl" | "oei" })}
          >
            <option value="all">Todos los embudos</option>
            <option value="vsl">VSL | CLOSERS</option>
            <option value="oei">OEI</option>
          </select>
        </label>
        {filters.pipeline === "vsl" && (
          <label className="block w-full max-w-xs">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Tipo
            </span>
            <select
              className={fieldClass}
              value={filters.leadType}
              onChange={(e) => onChange({ leadType: e.target.value as "all" | "paid" | "organic" })}
            >
              <option value="all">Todos</option>
              <option value="paid">Pagados</option>
              <option value="organic">Orgánicos</option>
            </select>
          </label>
        )}
        <label className="block w-full max-w-xs">
          <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
            Calendario
          </span>
          <select
            value={filters.calendar ?? ""}
            onChange={(e) => onChange({ calendar: e.target.value })}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {calendars.map((calendar) => (
              <option key={calendar} value={calendar}>
                {calendar}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fecha de agendamiento
        </span>
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => onPreset(preset.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              filters.preset === preset.value
                ? "border-brand bg-brand-soft font-medium text-brand"
                : "border-border bg-surface text-muted-foreground hover:bg-accent"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value, preset: "custom" })}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value, preset: "custom" })}
            className={fieldClass}
          />
        </label>
        {filters.pipeline !== "oei" && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              {filters.pipeline === "all" ? "Setter VSL" : "Setter asignado"}
            </span>
            <select
              value={filters.setter}
              onChange={(e) => onChange({ setter: e.target.value })}
              className={fieldClass}
            >
              <option value="">Todos</option>
              {filters.setter && !setters.includes(filters.setter) && (
                <option value={filters.setter}>{filters.setter} (sin registros de este tipo)</option>
              )}
              {setters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {filters.pipeline !== "vsl" && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              {filters.pipeline === "all" ? "Agendador OEI" : "Agendador"}
            </span>
            <select
              value={filters.booker}
              onChange={(e) => onChange({ booker: e.target.value })}
              className={fieldClass}
            >
              <option value="">Todos</option>
              {filters.booker && !bookers.includes(filters.booker) && (
                <option value={filters.booker}>{filters.booker} (sin registros)</option>
              )}
              {bookers.map((booker) => (
                <option key={booker} value={booker}>
                  {booker}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Estado de agendamiento</span>
          <select
            value={filters.estadoAgenda}
            onChange={(e) => onChange({ estadoAgenda: e.target.value })}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {CALENDAR_STATUSES.map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
          </select>
        </label>
        {filters.pipeline !== "oei" && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">VSL Origen</span>
            <select
              className={fieldClass}
              value={filters.vslOrigen}
              onChange={(e) => onChange({ vslOrigen: e.target.value })}
            >
              <option value="">Todos</option>
              {filters.vslOrigen && !origins.includes(filters.vslOrigen) && (
                <option value={filters.vslOrigen}>{filters.vslOrigen} (sin registros)</option>
              )}
              {origins.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Closer</span>
          <select
            className={fieldClass}
            value={filters.closer}
            onChange={(e) => onChange({ closer: e.target.value })}
          >
            <option value="">Todos</option>
            {filters.closer && !closers.includes(filters.closer) && (
              <option value={filters.closer}>{filters.closer} (sin registros)</option>
            )}
            {closers.map((closer) => (
              <option key={closer} value={closer}>
                {closer}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            onClick={onClear}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            Limpiar filtros
          </button>
        </div>
      </div>
    </div>
  );
}
