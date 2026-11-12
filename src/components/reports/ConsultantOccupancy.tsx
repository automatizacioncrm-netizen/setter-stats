import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatHours,
  formatOccupancy,
  occupancySchema,
  shiftDate,
  limaToday,
  occupancyParams,
  quickRange,
  rangeError,
  type DateRange,
  type OccupancyPeriod,
  type OccupancySelection,
  type OccupancyReport,
  type OccupancyStructure,
} from "@/lib/consultant-occupancy";

const fallback = "No se pudo cargar la ocupación";
const button = "rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";

function summary(total: OccupancyStructure["total"]) {
  return `${formatHours(total.horasAgendadas)} de ${formatHours(total.horasDisponibles)} · ${formatOccupancy(total.porcentaje)}`;
}

function StructureCard({
  nombre,
  periodos,
  total,
  grouping,
  user,
  breakdown = [],
}: OccupancyStructure & {
  grouping: "dia" | "semana";
  user: string | null | undefined;
  breakdown?: OccupancyStructure[];
}) {
  const maxHours = Math.max(
    8,
    ...periodos.flatMap((day) => [day.horasDisponibles, day.horasAgendadas]),
  );
  const chartData = periodos.map((day, index) => ({
    ...day,
    ocupacion: formatOccupancy(day.porcentaje),
    desglose: breakdown
      .map(
        (structure) =>
          `${structure.nombre} ${formatHours(structure.periodos[index]!.horasAgendadas)}`,
      )
      .join(" · "),
  }));

  return (
    <article className="min-w-0 space-y-4 rounded-xl border border-border bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold">
          {nombre}
          {user && ` · ${user}`}
        </h3>
        <p className="text-sm text-muted-foreground">{summary(total)}</p>
      </div>
      <div className={periodos.length > 31 ? "max-h-[28rem] overflow-auto" : "overflow-x-auto"}>
        <table className="w-full min-w-[420px] text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              {[
                grouping === "dia" ? "Día" : "Semana",
                "H. Disponibles",
                "H. Agendadas",
                "% Ocupación",
              ].map((label) => (
                <th key={label} scope="col" className="px-3 py-2 text-right first:text-left">
                  {label}
                </th>
              ))}
              {breakdown.map(({ nombre }) => (
                <th
                  key={nombre}
                  scope="col"
                  className="px-3 py-2 text-right text-xs text-muted-foreground"
                >
                  {nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periodos.map((day, index) => (
              <tr key={day.desde} className="border-b border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {day.etiqueta}
                </th>
                <td className="px-3 py-2 text-right">{formatHours(day.horasDisponibles)}</td>
                <td className="px-3 py-2 text-right">{formatHours(day.horasAgendadas)}</td>
                <td className="px-3 py-2 text-right">{formatOccupancy(day.porcentaje)}</td>
                {breakdown.map((structure) => (
                  <td
                    key={structure.nombre}
                    className="px-3 py-2 text-right text-xs text-muted-foreground"
                  >
                    {formatHours(structure.periodos[index]!.horasAgendadas)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/50 font-bold">
            <tr>
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              <td className="px-3 py-2 text-right">{formatHours(total.horasDisponibles)}</td>
              <td className="px-3 py-2 text-right">{formatHours(total.horasAgendadas)}</td>
              <td className="px-3 py-2 text-right">{formatOccupancy(total.porcentaje)}</td>
              {breakdown.map((structure) => (
                <td
                  key={structure.nombre}
                  className="px-3 py-2 text-right text-xs text-muted-foreground"
                >
                  {formatHours(structure.total.horasAgendadas)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="h-64 min-w-0 text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="etiqueta"
              interval="preserveStartEnd"
              minTickGap={12}
              ticks={periodos
                .filter(
                  (_, index) =>
                    periodos.length <= 14 || index % Math.ceil(periodos.length / 8) === 0,
                )
                .map(({ etiqueta }) => etiqueta)}
            />
            <YAxis
              domain={[0, maxHours]}
              allowDataOverflow
              width={42}
              tickFormatter={formatHours}
            />
            <Tooltip
              formatter={(value: number) => formatHours(value)}
              labelFormatter={(label, items) => (
                <>
                  {label} · {items[0]?.payload.ocupacion ?? ""}
                  {items[0]?.payload.desglose && (
                    <span className="block text-muted-foreground">{items[0].payload.desglose}</span>
                  )}
                </>
              )}
            />
            <Legend />
            <Bar
              dataKey="horasDisponibles"
              name="H. Disponibles"
              fill="#cbd5e1"
              isAnimationActive={false}
            />
            <Bar
              dataKey="horasAgendadas"
              name="H. Agendadas"
              fill="var(--brand)"
              isAnimationActive={false}
            >
              {periodos.length <= 14 && (
                <LabelList
                  dataKey="ocupacion"
                  position="top"
                  fontSize={10}
                  fill="var(--foreground)"
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

const field = "max-w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
const quickOptions = [
  ["7", "Últimos 7 días"],
  ["30", "Últimos 30 días"],
  ["este", "Este mes"],
  ["pasado", "Mes pasado"],
] as const;
const modes = [
  ["semana", "Semana"],
  ["mes", "Mes"],
  ["rango", "Rango"],
] as const;
const groupings = [
  ["dia", "Día"],
  ["semana", "Semana"],
] as const;

function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
        {options.map(([key, name]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            className={
              value === key
                ? "bg-brand px-3 py-2 text-sm text-white"
                : "px-3 py-2 text-sm hover:bg-muted"
            }
            onClick={() => onChange(key)}
          >
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ConsultantOccupancy() {
  const [selection, setSelection] = useState<OccupancySelection>({
    period: { tipo: "semana" },
    estructura: "",
    usuario: "",
    agrupar: "",
  });
  const [draft, setDraft] = useState<DateRange>({ desde: "", hasta: "" });
  const [data, setData] = useState<OccupancyReport>();
  const [result, setResult] = useState<{ selection: OccupancySelection; error?: string }>();
  const { period, estructura, usuario, agrupar } = selection;
  const validation = period.tipo === "rango" ? rangeError(draft) : "";
  const canLoad = !validation;

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(`/api/reports/consultores?${occupancyParams(selection)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json();
        if (controller.signal.aborted) return;
        const parsed = occupancySchema.safeParse(body);
        if (!response.ok || !parsed.success) {
          setResult({ selection, error: typeof body?.error === "string" ? body.error : fallback });
          return;
        }
        setData(parsed.data);
        setResult({ selection });
      } catch {
        if (!controller.signal.aborted) setResult({ selection, error: fallback });
      }
    }

    void load();
    return () => controller.abort();
  }, [selection, canLoad]);

  function changePeriod(next: OccupancyPeriod) {
    setSelection((current) => ({ ...current, period: next }));
  }

  function applyRange(range: DateRange) {
    setDraft(range);
    changePeriod({ tipo: "rango", ...range });
  }

  function changeMode(mode: OccupancyPeriod["tipo"]) {
    if (mode === period.tipo) return;
    if (mode === "rango") applyRange(quickRange("30"));
    else if (mode === "mes") changePeriod({ tipo: "mes", mes: limaToday().slice(0, 7) });
    else changePeriod({ tipo: "semana" });
  }

  function changeStructure(value: string) {
    setSelection((current) => ({
      ...current,
      estructura: value,
      usuario:
        !value ||
        data?.usuarios.some(
          (user) => user.key === current.usuario && user.estructuras.includes(value),
        )
          ? current.usuario
          : "",
    }));
  }

  const current = result?.selection === selection ? result : undefined;
  const loading = canLoad && !current;
  const weeks = data?.semanas ?? [];
  const months = [...(data?.meses ?? [])].sort((a, b) => a.valor.localeCompare(b.valor));
  const weekStart =
    period.tipo === "semana"
      ? (period.week ??
        (data?.rango.tipo === "semana" && data.rango.esActual ? data.rango.desde : ""))
      : "";
  const previousWeek = weekStart && shiftDate(weekStart, -7);
  const nextWeek = weekStart && shiftDate(weekStart, 7);
  const activeMonth = period.tipo === "mes" ? period.mes : "";
  const previousMonth = months.filter((month) => month.valor < activeMonth).at(-1);
  const nextMonth = months.find((month) => month.valor > activeMonth);
  const users =
    data?.usuarios.filter((user) => !estructura || user.estructuras.includes(estructura)) ?? [];
  const userName = data?.filtros.usuarioNombre;
  const bonus = data?.filtros.usuario && !data.filtros.estructura ? data.bonoVisita : undefined;
  const bonusColumn =
    bonus &&
    (bonus.total.horasAgendadas > 0 || bonus.periodos.some((period) => period.horasAgendadas > 0))
      ? { ...bonus, nombre: "BONO DE VISITA" }
      : undefined;
  const combined =
    data?.filtros.usuario &&
    !data.filtros.estructura &&
    (data.estructuras.length >= 2 || bonusColumn)
      ? data.combinado
      : undefined;
  const unassigned = data?.diagnostico.eventosSinEstructuraEnLaSemana;
  const classified = data?.diagnostico.eventosClasificadosPorNombreEnLaSemana;

  return (
    <section
      className="mx-auto w-full min-w-0 max-w-[960px] space-y-4"
      aria-labelledby="consultant-occupancy"
    >
      <h2 id="consultant-occupancy" className="text-lg font-semibold">
        Ocupación semanal por estructura
      </h2>
      <Segments label="Período" options={modes} value={period.tipo} onChange={changeMode} />
      {period.tipo === "semana" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={button}
            disabled={!weeks.some((week) => week.inicio === previousWeek)}
            onClick={() => changePeriod({ tipo: "semana", week: previousWeek })}
          >
            ◀ Anterior
          </button>
          <select
            aria-label="Semana de ocupación"
            className={field}
            value={weekStart}
            disabled={!weeks.length}
            onChange={(event) => changePeriod({ tipo: "semana", week: event.target.value })}
          >
            {!weeks.some((week) => week.inicio === weekStart) && (
              <option value={weekStart} disabled>
                Semana actual
              </option>
            )}
            {weeks.map((week) => (
              <option key={week.inicio} value={week.inicio}>
                {week.label}
                {week.conDatos ? "" : " (sin datos)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={button}
            disabled={!weeks.some((week) => week.inicio === nextWeek)}
            onClick={() => changePeriod({ tipo: "semana", week: nextWeek })}
          >
            Siguiente ▶
          </button>
          <button type="button" className={button} onClick={() => changePeriod({ tipo: "semana" })}>
            Semana actual
          </button>
        </div>
      )}
      {period.tipo === "mes" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={button}
            aria-label="Mes anterior"
            disabled={!previousMonth}
            onClick={() => previousMonth && changePeriod({ tipo: "mes", mes: previousMonth.valor })}
          >
            ◀
          </button>
          <select
            aria-label="Mes de ocupación"
            className={field}
            value={period.mes}
            disabled={!months.length}
            onChange={(event) => changePeriod({ tipo: "mes", mes: event.target.value })}
          >
            {!months.some((month) => month.valor === activeMonth) && (
              <option value={activeMonth}>{activeMonth}</option>
            )}
            {months.map((month) => (
              <option key={month.valor} value={month.valor}>
                {month.label}
                {month.conDatos ? "" : " (sin datos)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={button}
            aria-label="Mes siguiente"
            disabled={!nextMonth}
            onClick={() => nextMonth && changePeriod({ tipo: "mes", mes: nextMonth.valor })}
          >
            ▶
          </button>
          <button
            type="button"
            className={button}
            onClick={() => changePeriod({ tipo: "mes", mes: limaToday().slice(0, 7) })}
          >
            Mes actual
          </button>
        </div>
      )}
      {period.tipo === "rango" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            {(["desde", "hasta"] as const).map((name) => (
              <label key={name} className="grid gap-1 text-sm font-medium">
                {name === "desde" ? "Desde" : "Hasta"}
                <input
                  type="date"
                  className={field}
                  value={draft[name]}
                  aria-invalid={!!validation}
                  aria-describedby={validation ? "occupancy-range-error" : undefined}
                  onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                />
              </label>
            ))}
            <button
              type="button"
              className={button}
              disabled={!!validation}
              onClick={() => applyRange(draft)}
            >
              Aplicar
            </button>
          </div>
          {validation && (
            <p id="occupancy-range-error" role="alert" className="text-sm text-destructive">
              {validation}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {quickOptions.map(([option, label]) => (
              <button
                key={option}
                type="button"
                className="rounded-full border border-border bg-white px-3 py-1 text-sm text-brand hover:bg-muted"
                onClick={() => applyRange(quickRange(option))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-medium">
          Estructura
          <select
            className={field}
            value={estructura}
            onChange={(event) => changeStructure(event.target.value)}
          >
            <option value="">Todas</option>
            {data?.estructurasDisponibles.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium">
          Usuario
          <select
            className={field}
            value={usuario}
            onChange={(event) => setSelection({ ...selection, usuario: event.target.value })}
          >
            <option value="">Todos</option>
            {users.map((user) => (
              <option key={user.key} value={user.key}>
                {user.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="self-start py-2 text-sm text-brand hover:underline sm:self-end"
          disabled={!estructura && !usuario}
          onClick={() => setSelection({ ...selection, estructura: "", usuario: "" })}
        >
          Limpiar filtros
        </button>
      </div>
      {period.tipo !== "semana" && (
        <Segments
          label="Ver por"
          options={groupings}
          value={agrupar || (data?.rango.tipo === period.tipo ? data.rango.agrupacion : undefined)}
          onChange={(value) => setSelection({ ...selection, agrupar: value })}
        />
      )}
      <div className="relative">
        <p
          aria-live="polite"
          role="status"
          className={
            data
              ? "pointer-events-none absolute right-0 top-0 z-20 text-sm text-muted-foreground"
              : "text-sm text-muted-foreground"
          }
        >
          {loading ? "Cargando…" : ""}
        </p>
        {current?.error && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-4 text-sm"
          >
            <p>{current.error}</p>
            <button
              type="button"
              className={button}
              disabled={!canLoad}
              onClick={() => setSelection({ ...selection })}
            >
              Reintentar
            </button>
          </div>
        )}
        {data && !current?.error && (
          <div aria-busy={loading} className={loading ? "space-y-4 opacity-50" : "space-y-4"}>
            <p className="pr-24 text-sm font-semibold">{data.rango.label}</p>
            {(combined
              ? combined.total.horasAgendadas === 0
              : data.estructuras.every(({ total }) => total.horasAgendadas === 0)) && (
              <p className="text-sm text-muted-foreground">Sin eventos agendados en este período</p>
            )}
            {combined ? (
              <StructureCard
                {...combined}
                nombre={
                  data.estructuras.length >= 2
                    ? `${userName} · ${data.estructuras.map(({ nombre }) => nombre).join(" + ")}`
                    : [data.estructuras[0]?.nombre, userName].filter(Boolean).join(" · ")
                }
                grouping={data.rango.agrupacion}
                user={null}
                breakdown={bonusColumn ? [...data.estructuras, bonusColumn] : data.estructuras}
              />
            ) : (
              data.estructuras.map((structure) => (
                <StructureCard
                  key={structure.nombre}
                  {...structure}
                  grouping={data.rango.agrupacion}
                  user={userName}
                />
              ))
            )}
            <div className="space-y-1 text-sm text-muted-foreground">
              {!combined && data.combinado && (
                <p>
                  {userName ? `Carga total de ${userName}` : "Todas las estructuras juntas"}:{" "}
                  {summary(data.combinado.total)}
                </p>
              )}
              <p>
                Si dos eventos se cruzan en el mismo horario, esa hora se cuenta una sola vez
                {combined ? ", por eso el total puede ser menor que la suma de las columnas." : "."}
              </p>
              {!data.filtros.usuario && !!data.bonosPorConsultor?.length && (
                <p>
                  Bonos de visita (no se cuentan en ninguna estructura):{" "}
                  {data.bonosPorConsultor
                    .map(
                      ({ nombre, horas, eventos }) =>
                        `${nombre} ${formatHours(horas)} (${eventos} visitas)`,
                    )
                    .join(" · ")}
                </p>
              )}
              {unassigned && (unassigned.horas > 0 || unassigned.eventos > 0) && (
                <p>
                  {unassigned.eventos} eventos ({formatHours(unassigned.horas)}) de este período no
                  tienen estructura asignada en la hoja y no se cuentan.
                </p>
              )}
              {classified && (classified.horas > 0 || classified.eventos > 0) && (
                <p>
                  {classified.eventos} eventos ({formatHours(classified.horas)}) se asignaron a su
                  estructura por el nombre del evento (SESIÓN DX, ENTREGA DX, E.XXXX) porque la
                  columna ESTRUCTURA estaba vacía.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
