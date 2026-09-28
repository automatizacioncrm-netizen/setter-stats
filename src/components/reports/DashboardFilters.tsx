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

interface Props {
  filters: ReportFilters;
  setters: string[];
  bookers: string[];
  closers: string[];
  origins: string[];
  calendars: string[];
  statuses: string[];
  onChange: (next: Partial<ReportFilters>) => void;
  onPreset: (preset: DatePreset) => void;
  onClear: () => void;
}

const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

// Presentation only: keep the API's option value unchanged.
const calendarOptions = [
  { id: "2stEL9p5aBxmHO5N7D8m", name: "Llamada de Claridad CM [A]", label: "VSL PAGADO - CIRCULO" },
  { id: "mvIUSeyGl6PvbEzue8za", name: "Llamada de Claridad CM [ORG]", label: "ORGANICO - CIRCULO" },
  {
    id: "pMZfD4DFxhQCJHC9zoK0",
    name: "Sesión Equipo Millonario (A)",
    label: "VSL PAGADO - EQUIPO",
  },
  {
    id: "yuWa4NolnVFmsURv7B7Q",
    name: "Sesión Equipo Millonario (ORG)",
    label: "ORGANICO - EQUIPO",
  },
];

export function DashboardFilters({
  filters,
  setters,
  bookers,
  closers,
  origins,
  calendars,
  statuses,
  onChange,
  onPreset,
  onClear,
}: Props) {
  const visibleCalendars = calendars
    .map((value) => {
      const index = calendarOptions.findIndex(
        (option) => option.id === value || option.name === value,
      );
      return {
        value,
        label: calendarOptions[index]?.label ?? value,
        order: index < 0 ? calendarOptions.length : index,
      };
    })
    .sort((a, b) => a.order - b.order);

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
            onChange={(e) =>
              onChange({ pipeline: e.target.value as "all" | "vsl" | "oei" | "lig" })
            }
          >
            <option value="all">Todos los embudos</option>
            <option value="vsl">VSL | Closers</option>
            <option value="oei">Lanzamiento I. Pagado OEI - EM</option>
            <option value="lig">Lanzamiento Interno Gratuito</option>
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
            {visibleCalendars.map((calendar) => (
              <option key={calendar.value} value={calendar.value}>
                {calendar.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Período
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
            key={`from-${filters.dateFrom}`}
            defaultValue={filters.dateFrom}
            onBlur={(e) => {
              if (e.target.validity.valid && e.target.value !== filters.dateFrom)
                onChange({ dateFrom: e.target.value, preset: "custom" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
          <input
            type="date"
            key={`to-${filters.dateTo}`}
            defaultValue={filters.dateTo}
            onBlur={(e) => {
              if (e.target.validity.valid && e.target.value !== filters.dateTo)
                onChange({ dateTo: e.target.value, preset: "custom" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={fieldClass}
          />
        </label>
        {
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Setter</span>
            <select
              value={filters.setter}
              onChange={(e) => onChange({ setter: e.target.value })}
              className={fieldClass}
            >
              <option value="">Todos</option>
              {filters.setter && !setters.includes(filters.setter) && (
                <option value={filters.setter}>
                  {filters.setter} (sin registros de este tipo)
                </option>
              )}
              {setters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        }
        {filters.pipeline !== "vsl" && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Creado por cita</span>
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
            {statuses.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </label>
        {(filters.pipeline === "vsl" || filters.pipeline === "all") && (
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
