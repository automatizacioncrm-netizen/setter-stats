import { z } from "zod";

export const CALENDARS = [
  { id: "2stEL9p5aBxmHO5N7D8m", name: "Llamada de Claridad CM [A]", label: "VSL - CM" },
  { id: "mvIUSeyGl6PvbEzue8za", name: "Llamada de Claridad CM [ORG]", label: "ORG - CM" },
  { id: "pMZfD4DFxhQCJHC9zoK0", name: "Sesión Equipo Millonario (A)", label: "VSL - EM" },
  { id: "yuWa4NolnVFmsURv7B7Q", name: "Sesión Equipo Millonario (ORG)", label: "ORG - EM" },
] as const;
export type CalendarId = (typeof CALENDARS)[number]["id"];
const cell = z.union([z.string(), z.number(), z.null()]).optional();
export const appointmentsPayload = z.object({
  ok: z.literal(true),
  rows: z.array(
    z.object({
      "Id. de cita": cell,
      "FECHA CITA": cell,
      "Hora solicitada": cell,
      "CLOSER ASIGNADO": cell,
      Calendario: cell,
      "_Calendar ID": cell,
      Resultado: cell,
      "_Updated At": cell,
    }),
  ),
});
export type AppointmentRow = z.infer<typeof appointmentsPayload>["rows"][number];
export interface Appointment {
  Calendario?: string | null;
  id: string;
  date: string;
  closer: string;
  calendarId: CalendarId;
  status: string;
  showed: boolean;
}
export interface AppointmentFilters {
  leadType: "" | "pagado" | "organico";
  dateFrom: string;
  dateTo: string;
  closer: string;
  calendar: string;
}
const str = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) =>
  str(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

// Calendar dates stay as YYYY-MM-DD. Only explicit instants are converted to Lima.
export function appointmentDate(value: unknown): string | null {
  const text = str(value);
  let date = "";
  const sheetDate = text.match(
    /^([a-z]{3})\s+(\d{1,2})\s+(\d{4})(?:\s+(?:0?[1-9]|1[0-2]):[0-5]\d(?:\:[0-5]\d)?\s+[ap]m)?$/i,
  );
  if (sheetDate) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(sheetDate[1]!.toLowerCase()) + 1;
    if (!month) return null;
    // Sheets displays a local Lima date. Do not convert the English date/time to UTC.
    date = `${sheetDate[3]}-${String(month).padStart(2, "0")}-${sheetDate[2]!.padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const instant = new Date(text);
    if (Number.isNaN(instant.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    date = ["year", "month", "day"]
      .map((key) => parts.find((p) => p.type === key)?.value)
      .join("-");
  } else if (/^\d{4}-\d{2}-\d{2}(?:$|[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$)/.test(text)) {
    date = text.slice(0, 10);
  } else {
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$| \d{2}:\d{2}(?::\d{2})?$)/);
    if (match) date = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!
    ? date
    : null;
}

export function getAppointmentDateKey(row: AppointmentRow): string | null {
  return appointmentDate(row["Hora solicitada"]) ?? appointmentDate(row["FECHA CITA"]);
}

export function normalizeAppointments(rows: AppointmentRow[]) {
  // Resolve duplicates before filtering: latest _Updated At wins; ties use the last row.
  const unique = new Map<string, { row: AppointmentRow; updated: number }>();
  let invalid = 0;
  let missingId = 0;
  let invalidDate = 0;
  let duplicates = 0;
  let unmonitoredCalendar = 0;
  for (const row of rows) {
    const id = str(row["Id. de cita"]);
    if (!id) {
      invalid++;
      missingId++;
      continue;
    }
    const timestamp = str(row["_Updated At"]);
    const updated =
      Date.parse(
        timestamp +
          (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?$/.test(timestamp) ? "-05:00" : ""),
      ) || 0;
    if (unique.has(id)) duplicates++;
    if (!unique.has(id) || updated >= unique.get(id)!.updated) unique.set(id, { row, updated });
  }
  const appointments: Appointment[] = [];
  for (const [id, { row }] of unique) {
    const calendarId = str(row["_Calendar ID"]);
    const calendar = calendarId
      ? CALENDARS.find((c) => c.id === calendarId)
      : CALENDARS.find((c) =>
          [c.name, c.label].some((name) => normalized(name) === normalized(row.Calendario)),
        );
    if (!calendar) {
      unmonitoredCalendar++;
      continue;
    }
    const date = getAppointmentDateKey(row);
    if (!date) {
      invalid++;
      invalidDate++;
      continue;
    }
    const status = str(row["Resultado"]).toLowerCase();
    appointments.push({
      id,
      date,
      calendarId: calendar.id,
      closer: str(row["CLOSER ASIGNADO"]) || "Sin closer asignado",
      status,
      showed: status === "showed",
    });
  }
  if (import.meta.env.DEV) {
    console.info("[vsl-citas] normalización", {
      received: rows.length,
      valid: appointments.length,
      missingId,
      invalidDate,
      duplicates,
      unmonitoredCalendar,
    });
  }
  return { appointments, invalid };
}

export function getLeadType(calendarName: unknown): "organico" | "pagado" {
  return String(calendarName || "").toUpperCase().includes("ORG") ? "organico" : "pagado";
}

export function aggregateAppointments(appointments: Appointment[], filters: AppointmentFilters) {
  const invalidRange = Boolean(
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo,
  );
  const rows = appointments.filter(
    (a) =>
      !invalidRange &&
      (!filters.dateFrom || a.date >= filters.dateFrom) &&
      (!filters.dateTo || a.date <= filters.dateTo) &&
      (!filters.closer || a.closer === filters.closer) &&
      (!filters.calendar || a.calendarId === filters.calendar) &&
      (!filters.leadType ||
        getLeadType(a.Calendario ?? CALENDARS.find((c) => c.id === a.calendarId)?.name) === filters.leadType),
  );
  const effective = rows.filter((a) => a.status === "showed").length;
  const confirmed = rows.filter((a) => a.status === "confirmed").length;
  const noshow = rows.filter((a) => a.status === "noshow").length;
  const cancelled = rows.filter((a) => a.status === "cancelled").length;
  const closers = [...new Set(rows.map((a) => a.closer))].sort((a, b) => a.localeCompare(b, "es"));
  const table = closers.map((closer) => {
    const categories = CALENDARS.map((calendar) => {
      const appointments = rows.filter((a) => a.closer === closer && a.calendarId === calendar.id);
      const totalAppointments = appointments.length;
      const effectiveSessions = appointments.filter((a) => a.status === "showed").length;
      return {
        totalAppointments,
        effectiveSessions,
        confirmed: appointments.filter((a) => a.status === "confirmed").length,
        noshow: appointments.filter((a) => a.status === "noshow").length,
        cancelled: appointments.filter((a) => a.status === "cancelled").length,
        attendanceRate: totalAppointments ? (effectiveSessions / totalAppointments) * 100 : 0,
      };
    });
    const counts = categories.map((category) => category.effectiveSessions);
    const total = counts.reduce((sum, n) => sum + n, 0);
    const totalAppointments = categories.reduce((sum, category) => sum + category.totalAppointments, 0);
    return {
      closer, counts, categories, total, totalAppointments,
      confirmed: categories.reduce((sum, category) => sum + category.confirmed, 0),
      noshow: categories.reduce((sum, category) => sum + category.noshow, 0),
      cancelled: categories.reduce((sum, category) => sum + category.cancelled, 0),
      attendanceRate: totalAppointments ? (total / totalAppointments) * 100 : 0,
    };
  });
  const days = new Map<string, { date: string; appointments: number; effective: number }>();
  const dates = rows.map((row) => row.date).sort();
  const start = filters.dateFrom || dates[0];
  const end = filters.dateTo || dates[dates.length - 1];
  if (!invalidRange && start && end && (filters.dateFrom || filters.dateTo)) {
    // UTC is used only to advance calendar days, never to reinterpret appointment times.
    const cursor = new Date(`${start}T12:00:00Z`);
    while (!Number.isNaN(cursor.getTime()) && cursor.toISOString().slice(0, 10) <= end) {
      const date = cursor.toISOString().slice(0, 10);
      days.set(date, { date, appointments: 0, effective: 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  for (const row of rows) {
    const day = days.get(row.date) ?? { date: row.date, appointments: 0, effective: 0 };
    day.appointments++;
    day.effective += Number(row.showed);
    days.set(row.date, day);
  }
  return {
    total: rows.length,
    effective,
    confirmed,
    noshow,
    cancelled,
    attendance: rows.length ? (effective / rows.length) * 100 : 0,
    table,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
