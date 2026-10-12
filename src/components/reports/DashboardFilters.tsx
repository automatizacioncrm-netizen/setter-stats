import { RotateCcw, X } from "lucide-react";
import { type DatePreset, type ReportFilters } from "@/types/reports";
import { getCanonicalSetterName, getSetterOptions } from "@/lib/setter-performance";
import { isValidReportRange, REPORT_CLOSERS } from "@/lib/report-filter-state";
import { SearchableFilter } from "./SearchableFilter";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "todos", label: "Todos los periodos" },
  { value: "mes", label: "Este mes" },
  { value: "mesPasado", label: "Mes pasado" },
  { value: "custom", label: "Personalizado" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
];
interface Props {
  filters: ReportFilters;
  setters: string[];
  bookers: string[];
  closers: string[];
  origins: string[];
  calendars: string[];
  statuses: string[];
  busy?: boolean;
  apiNormalizedSetters?: boolean;
  onChange: (next: Partial<ReportFilters>) => void;
  onPreset: (preset: DatePreset) => void;
  onClear: () => void;
}
const fieldClass =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const calendarOptions = [
  {
    id: "2stEL9p5aBxmHO5N7D8m",
    name: "Llamada de Claridad CM [A]",
    label: "VSL PAGADO - CIRCULO MILLONARIO",
  },
  {
    id: "mvIUSeyGl6PvbEzue8za",
    name: "Llamada de Claridad CM [ORG]",
    label: "ORGANICO - CIRCULO MILLONARIO",
  },
  {
    id: "pMZfD4DFxhQCJHC9zoK0",
    name: "Sesión Equipo Millonario (A)",
    label: "VSL PAGADO - EQUIPO MILLONARIO",
  },
  {
    id: "yuWa4NolnVFmsURv7B7Q",
    name: "Sesión Equipo Millonario (ORG)",
    label: "ORGANICO - EQUIPO MILLONARIO",
  },
];

export function DashboardFilters({
  filters,
  setters,
  bookers,
  origins,
  calendars,
  statuses,
  onChange,
  onPreset,
  onClear,
  busy = false,
  apiNormalizedSetters = false,
}: Props) {
  const pipeline = filters.pipeline ?? "all";
  const usesBooker = pipeline === "oei" || pipeline === "lig";
  const person = usesBooker ? filters.booker : filters.setter;
  const personLabel = usesBooker
    ? "Agendador"
    : pipeline === "vsl"
      ? "Setter"
      : "Setter / Agendador";
  const setterOptions = getSetterOptions(
    usesBooker ? bookers : pipeline === "all" ? [...setters, ...bookers] : setters,
    apiNormalizedSetters,
  );
  const closerOptions = REPORT_CLOSERS.map((value) => ({ value, label: value }));
  const changePerson = (value: string) =>
    onChange(usesBooker ? { booker: value, setter: "" } : { setter: value, booker: "" });
  const advancedCount =
    Number(Boolean(filters.calendar)) +
    Number(Boolean(filters.estadoAgenda)) +
    Number(Boolean(filters.vslOrigen)) +
    Number(filters.leadType !== "all");
  const rangeLabel =
    filters.preset === "mesPasado" && filters.dateFrom
      ? new Date(`${filters.dateFrom}T12:00:00Z`).toLocaleDateString("es-PE", {
          month: "long",
          year: "numeric",
          timeZone: "America/Lima",
        })
      : filters.preset === "custom"
        ? `${filters.dateFrom || "Desde"} — ${filters.dateTo || "Hasta"}`
        : (PRESETS.find((preset) => preset.value === filters.preset)?.label ?? "Periodo");
  const chips: { label: string; remove: () => void }[] = [];
  if (pipeline !== "all")
    chips.push({ label: pipeline.toUpperCase(), remove: () => onChange({ pipeline: "all" }) });
  if (filters.preset !== "todos" || filters.dateFrom || filters.dateTo)
    chips.push({ label: rangeLabel, remove: () => onPreset("todos") });
  if (person)
    chips.push({
      label: apiNormalizedSetters ? person : (getCanonicalSetterName(person) ?? person),
      remove: () => changePerson(""),
    });
  if (filters.closer) chips.push({ label: filters.closer, remove: () => onChange({ closer: "" }) });
  if (filters.calendar)
    chips.push({ label: filters.calendar, remove: () => onChange({ calendar: "" }) });
  if (filters.estadoAgenda)
    chips.push({ label: filters.estadoAgenda, remove: () => onChange({ estadoAgenda: "" }) });
  if (filters.vslOrigen)
    chips.push({ label: filters.vslOrigen, remove: () => onChange({ vslOrigen: "" }) });
  if (filters.leadType !== "all")
    chips.push({
      label: filters.leadType === "paid" ? "Pagados" : "Orgánicos",
      remove: () => onChange({ leadType: "all" }),
    });
  return (
    <section
      aria-label="Filtros del reporte"
      className="rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Embudo</span>
          <select
            aria-label="Embudo"
            className={fieldClass}
            value={pipeline}
            onChange={(event) =>
              onChange({ pipeline: event.target.value as "all" | "vsl" | "oei" | "lig" })
            }
          >
            <option value="all">Todos (VSL + OEI + LIG)</option>
            <option value="vsl">VSL | Closers</option>
            <option value="oei">Lanzamiento I. Pagado OEI - EM</option>
            <option value="lig">Lanzamiento Interno Gratuito</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Periodo / Mes
          </span>
          <select
            aria-label="Periodo / Mes"
            className={fieldClass}
            value={filters.preset}
            onChange={(event) => onPreset(event.target.value as DatePreset)}
          >
            {PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <SearchableFilter
          label={personLabel}
          value={apiNormalizedSetters ? person : (getCanonicalSetterName(person) ?? person)}
          options={setterOptions}
          allLabel={usesBooker ? "Todos los agendadores" : "Todos los setters"}
          onChange={changePerson}
          disabled={busy}
        />
        <SearchableFilter
          label="Closer"
          value={filters.closer}
          options={closerOptions}
          allLabel="Todos los closers"
          onChange={(closer) => onChange({ closer })}
          disabled={busy}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {PRESETS.filter((preset) => ["mes", "mesPasado", "custom"].includes(preset.value)).map(
          (preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onPreset(preset.value)}
              aria-pressed={filters.preset === preset.value}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${filters.preset === preset.value ? "border-brand bg-brand-soft font-medium text-brand" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              {preset.label}
            </button>
          ),
        )}
        {filters.preset !== "custom" && (filters.dateFrom || filters.dateTo) && (
          <span className="text-xs text-muted-foreground">
            {filters.dateFrom} — {filters.dateTo}
          </span>
        )}
      </div>
      {filters.preset === "custom" && (
        <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
          {(["dateFrom", "dateTo"] as const).map((key) => (
            <label key={key}>
              <span className="mb-1 block text-xs text-muted-foreground">
                {key === "dateFrom" ? "Desde" : "Hasta"}
              </span>
              <input
                type="date"
                value={filters[key]}
                className={fieldClass}
                aria-invalid={!isValidReportRange(filters)}
                aria-describedby={!isValidReportRange(filters) ? "report-date-error" : undefined}
                onChange={(event) => {
                  if (event.target.validity.valid)
                    onChange({ [key]: event.target.value, preset: "custom" });
                }}
              />
            </label>
          ))}
          {!isValidReportRange(filters) && (
            <p
              id="report-date-error"
              role="alert"
              className="text-sm text-destructive sm:col-span-2"
            >
              Desde debe ser anterior o igual a Hasta. Revisa las fechas.
            </p>
          )}
        </div>
      )}
      {chips.length > 0 && (
        <div aria-label="Filtros activos" className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((chip, index) => (
            <button
              key={`${index}-${chip.label}`}
              type="button"
              onClick={chip.remove}
              aria-label={`Quitar filtro ${chip.label}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground hover:bg-accent"
            >
              <span className="truncate">{chip.label}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand hover:underline"
          >
            <RotateCcw className="h-3 w-3" />
            Limpiar filtros
          </button>
        </div>
      )}
      <details className="mt-3 border-t border-border pt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Más filtros{advancedCount > 0 ? ` · ${advancedCount} activos` : ""}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">Calendario</span>
            <select
              className={fieldClass}
              value={filters.calendar ?? ""}
              onChange={(event) => onChange({ calendar: event.target.value })}
            >
              <option value="">Todos</option>
              {calendars.map((value) => (
                <option key={value} value={value}>
                  {calendarOptions.find((option) => option.id === value || option.name === value)
                    ?.label ?? value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">Estado de agendamiento</span>
            <select
              className={fieldClass}
              value={filters.estadoAgenda}
              onChange={(event) => onChange({ estadoAgenda: event.target.value })}
            >
              <option value="">Todos</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {pipeline === "vsl" && (
            <>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">VSL Origen</span>
                <select
                  className={fieldClass}
                  value={filters.vslOrigen}
                  onChange={(event) => onChange({ vslOrigen: event.target.value })}
                >
                  <option value="">Todos</option>
                  {origins.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">Tipo VSL</span>
                <select
                  className={fieldClass}
                  value={filters.leadType}
                  onChange={(event) =>
                    onChange({ leadType: event.target.value as "all" | "paid" | "organic" })
                  }
                >
                  <option value="all">Todos</option>
                  <option value="paid">Pagados</option>
                  <option value="organic">Orgánicos</option>
                </select>
              </label>
            </>
          )}
        </div>
      </details>
    </section>
  );
}
