import { z } from "zod";

const totals = z.object({
  horasDisponibles: z.number(),
  horasAgendadas: z.number(),
  porcentaje: z.number(),
});
const occupancy = z.object({
  periodos: z.array(totals.extend({ etiqueta: z.string(), desde: z.string().date() })),
  total: totals,
});
const week = z.object({ inicio: z.string().date(), label: z.string() });
const structure = occupancy.extend({ nombre: z.string() });
const grouping = z.enum(["dia", "semana"]);
const events = z.object({ eventos: z.number(), horas: z.number() });

export const occupancySchema = z.object({
  success: z.literal(true),
  rango: z.object({
    tipo: z.enum(["semana", "mes", "rango"]),
    desde: z.string().date(),
    hasta: z.string().date(),
    label: z.string(),
    agrupacion: grouping,
    esActual: z.boolean(),
  }),
  filtros: z.object({
    estructura: z.string().nullish(),
    usuario: z.string().nullish(),
    usuarioNombre: z.string().nullish(),
  }),
  estructurasDisponibles: z.array(z.string()),
  usuarios: z.array(
    z.object({ key: z.string(), nombre: z.string(), estructuras: z.array(z.string()) }),
  ),
  semanas: z.array(week.extend({ conDatos: z.boolean() })),
  meses: z.array(z.object({ valor: z.string(), label: z.string(), conDatos: z.boolean() })),
  estructuras: z.array(structure),
  combinado: occupancy.nullish(),
  bonoVisita: occupancy.nullish(),
  bonosPorConsultor: z
    .array(
      z.object({
        nombre: z.string(),
        horas: z.number(),
        eventos: z.number(),
      }),
    )
    .nullish(),
  diagnostico: z.object({
    eventosSinEstructuraEnLaSemana: events,
    eventosClasificadosPorNombreEnLaSemana: events,
  }),
});

export type OccupancyReport = z.infer<typeof occupancySchema>;
export type OccupancyStructure = z.infer<typeof structure>;

const hours = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2, useGrouping: false });
const percent = new Intl.NumberFormat("es-PE", {
  style: "percent",
  maximumFractionDigits: 1,
  useGrouping: false,
});
export const formatHours = (value: number) => hours.format(value).replace(".", ",") + " h";
export const formatOccupancy = (value: number) =>
  percent.format(value).replace(".", ",").replace(/\s*%/, " %");

export function shiftDate(start: string, days: number) {
  const date = new Date(start + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type DateRange = { desde: string; hasta: string };
export type OccupancyPeriod =
  | { tipo: "semana"; week?: string }
  | { tipo: "mes"; mes: string }
  | ({ tipo: "rango" } & DateRange);
export type OccupancySelection = {
  period: OccupancyPeriod;
  estructura: string;
  usuario: string;
  agrupar: "" | z.infer<typeof grouping>;
};

export function limaToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima", dateStyle: "short" }).format(
    now,
  );
}

export function quickRange(option: "7" | "30" | "este" | "pasado", today = limaToday()): DateRange {
  const monthStart = today.slice(0, 7) + "-01";
  if (option === "este") {
    const nextMonth = new Date(monthStart + "T00:00:00Z");
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return { desde: monthStart, hasta: shiftDate(nextMonth.toISOString().slice(0, 10), -1) };
  }
  if (option === "pasado") {
    const hasta = shiftDate(monthStart, -1);
    return { desde: hasta.slice(0, 7) + "-01", hasta };
  }
  return { desde: shiftDate(today, 1 - Number(option)), hasta: today };
}

export function rangeError({ desde, hasta }: DateRange) {
  if (!desde || !hasta) return "Completa las fechas Desde y Hasta.";
  const date = z.string().date();
  if (!date.safeParse(desde).success || !date.safeParse(hasta).success)
    return "Ingresa fechas válidas.";
  if (desde > hasta) return "Desde no puede ser posterior a Hasta.";
  if (hasta > shiftDate(desde, 365)) return "El rango admite un máximo de 366 días.";
  return "";
}

export function occupancyParams({ period, estructura, usuario, agrupar }: OccupancySelection) {
  const params = new URLSearchParams({ action: "ocupacion" });
  if (period.tipo === "semana") {
    if (period.week) params.set("week", period.week);
  } else {
    if (period.tipo === "mes") params.set("mes", period.mes);
    else {
      params.set("desde", period.desde);
      params.set("hasta", period.hasta);
    }
    if (agrupar) params.set("agrupar", agrupar);
  }
  if (estructura) params.set("estructura", estructura);
  if (usuario) params.set("usuario", usuario);
  return params;
}
