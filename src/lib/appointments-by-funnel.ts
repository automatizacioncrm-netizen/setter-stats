import { rangePeriod, monthOfYear } from "./vsl-date-range";
import { formatSurveyMonth, normalizeSurveyMonth } from "./survey-month";
import { z } from "zod";
import { surveyPeriodKey } from "./vsl-period";
import type { DateRange } from "./vsl-date-range";
export const funnelAppointmentColumns = [
  "EMBUDO",
  "PERIODO / MES",
  "TOTAL AGENDAMIENTOS",
  "ASISTIDOS",
  "% ASISTIDOS",
  "NO ASISTIDOS / RESTANTES",
  "% NO ASISTIDOS / RESTANTES",
  "CANCELADOS REALES",
  "NO SHOW",
  "CONFIRMADOS",
  "OTROS",
];
const count = z.number().finite().int().nonnegative();
const ratio = z.number().finite().min(0).max(1);
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
export const appointmentsByFunnelSchema = z
  .object({
    columns: z
      .array(z.string())
      .length(11)
      .refine(
        (columns) =>
          columns.every(
            (column, index) =>
              normalized(column) === normalized(funnelAppointmentColumns[index] ?? ""),
          ),
        "Los encabezados de agendamientos no corresponden a las once métricas esperadas.",
      ),
    rows: z.array(
      z.tuple([
        z.string().min(1),
        z.string().min(1),
        count,
        count,
        ratio,
        count,
        ratio,
        count,
        count,
        count,
        count,
      ]),
    ),
    sourceSheet: z.enum(["VSL_APPOINTMENTS", "APPOINTMENTS_MASTER"]),
    truncated: z.boolean(),
    skippedWithoutDate: count.optional(),
    percentColumns: z
      .array(z.number().int())
      .refine(
        (columns) => columns.length === 2 && columns[0] === 4 && columns[1] === 6,
        "Las columnas porcentuales deben ser 4 y 6.",
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    const keys = new Set<string>();
    data.rows.forEach((row, index) => {
      const key = normalized(row[0]) + "/" + surveyPeriodKey(row[1]);
      if (keys.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["rows", index],
          message: "Fila duplicada por embudo y período; no se suman ni ocultan registros.",
        });
      keys.add(key);
    });
  });
export type AppointmentsByFunnel = z.infer<typeof appointmentsByFunnelSchema>;
export type FunnelAppointmentRow = AppointmentsByFunnel["rows"][number];
export function validateAppointmentsByFunnel(
  raw: unknown,
  filter?: DateRange,
): { data?: AppointmentsByFunnel; error?: string } {
  if (raw === undefined) return {};
  const parsed = appointmentsByFunnelSchema.safeParse(raw);
  if (!parsed.success)
    return {
      error:
        "La Tabla 3 recibió datos incompatibles: " +
        parsed.error.issues.map((issue) => issue.path.join(".") + ": " + issue.message).join("; "),
    };
  const monthlyError = validateMonthlyFunnels(parsed.data, filter);
  if (monthlyError) return { error: monthlyError };
  return { data: parsed.data };
}
export function displayFunnelCell(value: string | number, index: number): string {
  if (index === 4 || index === 6)
    return typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString("es-PE", { style: "percent", maximumFractionDigits: 0 })
      : "—";
  if (typeof value === "number")
    return Number.isFinite(value) ? value.toLocaleString("es-PE") : "—";
  return value;
}

function displayFunnelMonth(value: string): string {
  const range = rangePeriod(value);
  if (range) {
    const months = [
      formatSurveyMonth(range.startDate.slice(0, 7)),
      formatSurveyMonth(range.endDate.slice(0, 7)),
    ];
    return [...new Set(months)].join(" / ");
  }
  const iso = value.trim().match(/^(\d{4}-(?:0[1-9]|1[0-2]))(?:-|T|$)/);
  if (iso) return formatSurveyMonth(iso[1]);
  const aliases: [string, string][] = [
    ["ENE", "ENERO"],
    ["FEB", "FEBRERO"],
    ["MAR", "MARZO"],
    ["ABR", "ABRIL"],
    ["MAY", "MAYO"],
    ["JUN", "JUNIO"],
    ["JUL", "JULIO"],
    ["AGO", "AGOSTO"],
    ["SEP", "SEPTIEMBRE"],
    ["OCT", "OCTUBRE"],
    ["NOV", "NOVIEMBRE"],
    ["DIC", "DICIEMBRE"],
  ];
  const lookup = new Map<string, string>();
  for (const [short, name] of aliases) {
    lookup.set(short, name);
    lookup.set(name, name);
  }
  lookup.set("SET", "SEPTIEMBRE");
  lookup.set("SETIEMBRE", "SEPTIEMBRE");
  const months = normalized(value)
    .split(/[^A-Z]+/)
    .map((token) => lookup.get(token))
    .filter((month): month is string => !!month);
  return months.length ? [...new Set(months)].join(" / ") : value;
}

export function displayFunnelPeriod(value: string): string {
  const range = rangePeriod(value),
    month = displayFunnelMonth(value);
  if (range) {
    const start = range.startDate,
      end = range.endDate;
    if (start.slice(0, 7) === end.slice(0, 7)) {
      return month;
    }
    return (
      start.slice(8, 10) +
      " DE " +
      formatSurveyMonth(start.slice(0, 7)) +
      " DE " +
      start.slice(0, 4) +
      " AL " +
      end.slice(8, 10) +
      " DE " +
      formatSurveyMonth(end.slice(0, 7)) +
      " DE " +
      end.slice(0, 4)
    );
  }
  const cut = value.toUpperCase().match(/(?:DEL\s+)?(\d{1,2})\s+AL\s+(\d{1,2})/);
  return cut
    ? month + " DEL " + cut[1]!.padStart(2, "0") + " AL " + cut[2]!.padStart(2, "0")
    : month;
}
export function funnelMonthKey(period: string): string {
  const range = rangePeriod(period);
  if (range) return range.startDate.slice(0, 7);
  const iso = normalizeSurveyMonth(period);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(iso)) return iso;
  const month = normalizeSurveyMonth(displayFunnelMonth(period));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "";
  const year = period.match(/\b(\d{4})\b/);
  return year ? year[1] + month.slice(4) : month;
}
function funnelPeriodOrder(period: string): string {
  const range = rangePeriod(period);
  if (range) return range.endDate;
  const month = funnelMonthKey(period);
  if (!month) return "";
  const cut = period.match(/(?:DEL\s+)?(\d{1,2})\s+AL\s+(\d{1,2})/i);
  return month + "-" + (cut?.[2]?.padStart(2, "0") ?? "31");
}
export const funnelGroups = [
  "ORGÁNICO EQUIPO + ORGÁNICO CÍRCULO",
  "VSL PAGO CÍRCULO + VSL PAGO EQUIPO",
  "LIG CÍRCULO + LIG EQUIPO",
] as const;
export function presentFunnelGroups(rows: readonly FunnelAppointmentRow[]) {
  return funnelGroups.map((name) => ({
    name,
    rows: rows
      .filter((row) => row[0] === name)
      .sort((a, b) => funnelPeriodOrder(b[1]).localeCompare(funnelPeriodOrder(a[1]))),
  }));
}

function validateMonthlyFunnels(
  data: AppointmentsByFunnel,
  filter?: DateRange,
): string | undefined {
  const seen = new Set<string>();
  for (const row of data.rows) {
    const raw = row[1],
      range = rangePeriod(raw);
    if (!range && /(?:DEL\s+)?\d{1,2}\s+AL\s+\d{1,2}/i.test(raw))
      return "La Tabla 3 necesita agregación mensual desde VSL_APPOINTMENTS por Appointment ID único. La API todavía devuelve cortes históricos parciales; no se suman porque no cubren necesariamente todo el mes ni garantizan ausencia de duplicados.";
    if (range && range.startDate.slice(0, 7) !== range.endDate.slice(0, 7))
      return "La API devuelve un único agregado para un rango que cruza meses. La Tabla 3 requiere una fila por embudo y mes, recortada al filtro; no se puede repartir ese total sin los registros originales.";
    const month = funnelMonthKey(raw);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      return "El período de la Tabla 3 no permite identificar un mes calendario. El backend debe devolver YYYY-MM o el intervalo exacto dentro de ese mes.";
    const full = monthOfYear(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    if (filter) {
      const expectedStart = filter.startDate > full.startDate ? filter.startDate : full.startDate;
      const expectedEnd = filter.endDate < full.endDate ? filter.endDate : full.endDate;
      if (
        expectedStart > expectedEnd ||
        (range && (range.startDate !== expectedStart || range.endDate !== expectedEnd))
      )
        return "La Tabla 3 no corresponde al intervalo solicitado dentro de cada mes. No se incluyen citas fuera del filtro.";
    } else if (range && (range.startDate !== full.startDate || range.endDate !== full.endDate))
      return "El histórico de la Tabla 3 contiene un intervalo parcial. Se necesita un agregado del mes completo desde el backend; no se inventan citas para completar el mes.";
    const key = normalized(row[0]) + "/" + month;
    if (seen.has(key))
      return "La Tabla 3 recibió más de una fila por embudo y mes. Debe consolidarse en el backend por Appointment ID único; no se suman intervalos potencialmente superpuestos.";
    seen.add(key);
    const total = row[2],
      attended = row[3],
      remaining = row[5];
    if (total !== attended + row[8] + row[9] + row[10])
      return "La Tabla 3 tiene estados inconsistentes: TOTAL debe ser ASISTIDOS + NO SHOW + CONFIRMADOS + OTROS; CANCELADOS REALES es informativo y no forma parte del total. No se corrigen ni redistribuyen cifras en el frontend.";
    if (
      attended > total ||
      remaining !== total - attended ||
      Math.abs(row[4] - (total ? attended / total : 0)) > 1e-8 ||
      Math.abs(row[6] - (total ? remaining / total : 0)) > 1e-8
    )
      return "Los porcentajes o restantes de la Tabla 3 no corresponden a sus totales. El backend debe recalcular las proporciones a partir del agregado mensual; no se suman ni promedian porcentajes.";
  }
  return undefined;
}

export function formatCancellationPercent(cancelled: number, total: number) {
  return new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 2 }).format(
    total === 0 ? 0 : cancelled / total,
  );
}
