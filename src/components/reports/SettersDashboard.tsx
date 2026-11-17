import { Fragment, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { limaDay, monthOfYear, validDate } from "@/lib/vsl-date-range";
import {
  embudos,
  setterMetrics,
  settersReportSchema,
  settersReportTitle,
  type SetterMetrics,
} from "@/lib/setters-report";

const columns = Object.keys(setterMetrics) as (keyof typeof setterMetrics)[];
const monthLabel = new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" });
const daySchema = settersReportSchema.shape.totales.extend({ dia: z.string().refine(validDate) });
const reportSchema = settersReportSchema.extend({ porDia: daySchema.array().optional() });
const filterClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50";
const activeClass = "border-primary bg-primary text-primary-foreground";

function displayDate(isoDate: string) {
  return isoDate.split("-").reverse().join("/");
}

function DateField({
  label,
  value,
  today,
  onChange,
}: {
  label: string;
  value: string;
  today: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const currentDay = parseISO(today);
  const year = currentDay.getFullYear();

  return (
    <div className="flex flex-col gap-1 text-sm font-medium">
      <span>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label}, ${displayDate(value)}`}
            className={cn(filterClass, "flex w-36 items-center justify-between gap-2")}
          >
            {displayDate(value)}
            <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={label} className="w-auto p-0">
          <Calendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected}
            today={currentDay}
            locale={es}
            captionLayout="dropdown"
            startMonth={new Date(Math.min(selected.getFullYear(), year - 100), 0)}
            endMonth={new Date(Math.max(selected.getFullYear(), year + 10), 11)}
            formatters={{ formatMonthDropdown: (date) => format(date, "MMM", { locale: es }) }}
            onDayClick={(date) => {
              onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function recentMonths(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return Array.from({ length: 13 }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    const range = monthOfYear(date.getUTCFullYear(), date.getUTCMonth() + 1);
    const name = monthLabel.format(date);
    return {
      desde: range.startDate,
      hasta: offset === 0 ? today : range.endDate,
      label: `${name.charAt(0).toUpperCase()}${name.slice(1)} ${date.getUTCFullYear()}`,
    };
  });
}

function MetricsTable({
  label,
  firstColumn,
  children,
  scroll = false,
}: {
  label: string;
  firstColumn: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div
      className={`overflow-auto rounded-xl border border-border bg-surface${scroll ? " max-h-96" : ""}`}
    >
      <table aria-label={label} className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">
              {firstColumn}
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2 text-right">
                {setterMetrics[column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function MetricRow({ label, metrics }: { label: ReactNode; metrics: SetterMetrics | undefined }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
        {label}
      </th>
      {columns.map((column) => (
        <td key={column} className="px-3 py-2 text-right tabular-nums">
          {metrics?.[column] ?? 0}
        </td>
      ))}
    </tr>
  );
}

export function SettersDashboard() {
  const today = limaDay();
  const months = recentMonths(today);
  const [{ desde, hasta }, setRange] = useState(() => ({ desde: today, hasta: today }));
  const [draft, setDraft] = useState(() => ({ desde: today, hasta: today }));
  const [active, setActive] = useState("");
  const [dateError, setDateError] = useState("");
  const [embudo, setEmbudo] = useState("");
  const [setter, setSetter] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ["setters-report", desde, hasta, embudo],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ desde, hasta });
      if (embudo) params.set("embudo", embudo);
      const response = await fetch(`/api/reports/setters?${params}`, { signal }).catch(() => {
        throw new Error("No se pudo conectar con el servidor del reporte de setters.");
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body)
        throw new Error(body?.error ?? "No se pudo cargar el reporte de setters.");
      const parsed = reportSchema.safeParse(body);
      if (!parsed.success) throw new Error("El servidor devolvió un reporte de setters inválido.");
      if (desde !== hasta && !parsed.data.porDia)
        throw new Error("El servidor no devolvió el desglose del rango por día.");
      return parsed.data;
    },
    retry: false,
  });
  const isRange = desde !== hasta;
  const loadingRange = isRange && report.isFetching;
  const rangeLabel = `Del ${displayDate(desde)} al ${displayDate(hasta)}`;

  function applyRange(range: { desde: string; hasta: string }, preset = "") {
    setDraft({ desde: range.desde, hasta: range.hasta });
    setActive(preset);
    setDateError("");
    setSetter(null);
    if (range.desde === desde && range.hasta === hasta)
      void report.refetch({ cancelRefetch: false });
    else setRange(range);
  }

  function navigateDay(offset?: -1 | 1) {
    const day =
      offset === undefined ? limaDay() : format(addDays(parseISO(hasta), offset), "yyyy-MM-dd");
    applyRange({ desde: day, hasta: day });
  }

  const isToday = !isRange && desde === today;
  const data = report.data;
  const cards = data
    ? ([
        ["llamadas", data.metas?.llamadasSalientes ?? 100],
        ["seteosEM"],
        ["seteosCM"],
        ["agendamientosTotal", data.metas?.agendamientos ?? 7],
        ["callConfirmer"],
      ] as const)
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8">
      <header className="space-y-2">
        <Link to="/reports" className="text-sm text-brand hover:underline">
          ← Reportes comerciales
        </Link>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{settersReportTitle}</h1>
      </header>

      <div role="group" aria-label="Navegación diaria" className="flex flex-wrap gap-2">
        <button type="button" className={filterClass} onClick={() => navigateDay(-1)}>
          ← Día anterior
        </button>
        <button
          type="button"
          aria-pressed={isToday}
          className={cn(filterClass, isToday && activeClass)}
          onClick={() => navigateDay()}
        >
          Hoy
        </button>
        <button type="button" className={filterClass} onClick={() => navigateDay(1)}>
          Día siguiente →
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {(
          [
            ["Este mes", months[0]!],
            ["Mes anterior", months[1]!],
          ] as const
        ).map(([label, range]) => (
          <button
            key={label}
            type="button"
            aria-pressed={active === label}
            disabled={loadingRange}
            className={cn(filterClass, active === label && activeClass)}
            onClick={() => applyRange(range, label)}
          >
            {label}
          </button>
        ))}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Otro mes
          <select
            value={active.startsWith("month:") ? active.slice(6) : ""}
            disabled={loadingRange}
            className={cn(filterClass, active.startsWith("month:") && activeClass)}
            onChange={(event) => {
              const range = months.find((month) => month.desde === event.target.value);
              if (range) applyRange(range, `month:${range.desde}`);
            }}
          >
            <option value="" disabled>
              Selecciona un mes
            </option>
            {months.map((month) => (
              <option key={month.desde} value={month.desde}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.desde > draft.hasta) {
            setDateError("La fecha Desde no puede ser posterior a la fecha Hasta.");
            return;
          }
          applyRange(draft);
        }}
      >
        {(["desde", "hasta"] as const).map((field) => (
          <DateField
            key={field}
            label={field === "desde" ? "Desde (Lima)" : "Hasta (Lima)"}
            value={draft[field]}
            today={today}
            onChange={(value) => {
              setDraft((previous) => ({ ...previous, [field]: value }));
              setActive("");
              setDateError("");
            }}
          />
        ))}
        <button type="submit" className={filterClass} disabled={loadingRange}>
          Aplicar
        </button>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Embudo
          <select
            value={embudo}
            className="rounded-lg border border-border bg-background px-3 py-2"
            onChange={(event) => {
              setEmbudo(event.target.value);
              setSetter(null);
            }}
          >
            <option value="">Todos</option>
            {embudos.options.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </form>

      {dateError && (
        <p role="alert" className="text-sm text-destructive">
          {dateError}
        </p>
      )}
      <h2 className="font-semibold">{rangeLabel}</h2>
      {report.isFetching && <p role="status">Cargando...</p>}
      {report.isError && (
        <p role="alert" className="text-sm text-destructive">
          {report.error.message}
        </p>
      )}

      {data && (
        <>
          <section aria-label="Totales" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {cards.map(([metric, goal]) => (
              <div
                key={metric}
                className="rounded-xl border border-border bg-surface p-4 shadow-card"
              >
                <h2 className="text-sm text-muted-foreground">{setterMetrics[metric]}</h2>
                <p className="text-2xl font-semibold tabular-nums">{data.totales[metric] ?? 0}</p>
                {!isRange && goal !== undefined && (
                  <>
                    {goal > 0 && (
                      <progress
                        aria-label={`Progreso de ${setterMetrics[metric]}`}
                        className="w-full accent-primary"
                        value={Math.min(data.totales[metric] ?? 0, goal)}
                        max={goal}
                      />
                    )}
                    <p className="text-xs text-muted-foreground">Meta {goal}</p>
                  </>
                )}
              </div>
            ))}
          </section>

          {isRange && data.porDia && (
            <section className="space-y-2">
              <h2 className="font-semibold">Por día</h2>
              <MetricsTable label="Por día" firstColumn="Fecha" scroll>
                {[...data.porDia]
                  .sort((a, b) => a.dia.localeCompare(b.dia))
                  .map((row) => (
                    <MetricRow key={row.dia} label={displayDate(row.dia)} metrics={row} />
                  ))}
                <MetricRow label="TOTAL" metrics={data.totales} />
              </MetricsTable>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-semibold">Por embudo</h2>
            <MetricsTable label="Por embudo" firstColumn="Embudo">
              {embudos.options.map((name) => (
                <MetricRow
                  key={name}
                  label={name}
                  metrics={data.porEmbudo.find(
                    (row) =>
                      row.embudo === name ||
                      (name === "ORGANICO" &&
                        /^Captación orgánica de leads(?:\s*\|\s*Setters)?\s*$/i.test(
                          row.embudo ?? "",
                        )),
                  )}
                />
              ))}
            </MetricsTable>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Por setter</h2>
            <MetricsTable label="Por setter" firstColumn="Setter">
              {data.porSetterTotal.map((row, index) => (
                <Fragment key={row.setter ?? index}>
                  <MetricRow
                    metrics={row}
                    label={
                      row.setter ? (
                        <button
                          type="button"
                          aria-expanded={setter === row.setter}
                          className="text-brand underline"
                          onClick={() =>
                            setSetter(setter === row.setter ? null : (row.setter ?? null))
                          }
                        >
                          {row.setter}
                        </button>
                      ) : (
                        "—"
                      )
                    }
                  />
                  {setter === row.setter && data.porSetter
                    ? data.porSetter
                        .filter((detail) => detail.setter === row.setter)
                        .map((detail) => (
                          <MetricRow
                            key={detail.embudo}
                            label={
                              <span className="pl-4 text-muted-foreground">
                                {detail.embudo ?? "—"}
                              </span>
                            }
                            metrics={detail}
                          />
                        ))
                    : null}
                </Fragment>
              ))}
            </MetricsTable>
            {!data.porSetterTotal.length && (
              <p className="text-sm text-muted-foreground">Sin datos por setter.</p>
            )}
          </section>

          <footer className="space-y-1 text-xs text-muted-foreground">
            {(data.avisos?.seteosRealizadosSinFecha ?? 0) > 0 && (
              <p>Seteos realizados sin fecha: {data.avisos?.seteosRealizadosSinFecha}</p>
            )}
            {data.generadoEn && <p>Generado el {data.generadoEn}</p>}
          </footer>
        </>
      )}
    </div>
  );
}
