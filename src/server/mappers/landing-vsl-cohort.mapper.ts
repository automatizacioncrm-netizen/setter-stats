import { z } from "zod";
import type { LandingVslCohort, ReportFilters } from "../../types/reports";

const count = z.number().finite().int().nonnegative();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const appointment = z.object({
  appointmentId: z.string().trim().min(1),
  fechaReunion: date.or(z.literal("")),
  estadoCalendar: z.string(),
  estadoAgenda: z.string(),
  agendador: z.string(),
  closer: z.string(),
  calendario: z.string(),
});
const lead = z.object({
  opportunityId: z.string().trim().min(1),
  nombreContacto: z.string(),
  fechaCreacion: date,
  setter: z.string(),
  closerAsignado: z.string(),
  pipeline: z.literal("vsl"),
  resultadoAsistencia: z.enum(["Asistió", "No asistió", "Sin resultado", "Pendiente de agenda"]),
  citas: z.array(appointment),
});
const schema = z.object({
  totalLeads: count,
  porDia: z.array(
    z.object({
      fecha: date,
      totalLeads: count,
      leadsAsistidos: count,
      leadsNoAsistidos: count,
      leadsPendientesResultado: count,
      porcentajeAsistencia: z.number().finite().min(0).max(100),
      // A summary without individual records remains useful, but never invent detail.
      leads: z.array(lead).optional(),
    }),
  ),
});

// Deployed Apps Script contract supplied by the user. These are opportunity
// counts; citasAsistidas/citasNoAsistidas count appointments and are not used.
const deployedCounts = z.object({
  oportunidades: count,
  asistidos: count,
  noAsistidos: count,
  sinResultado: count,
});
const deployedSchema = z.object({
  pipeline: z.literal("vsl"),
  porDia: z.array(deployedCounts.extend({ fechaCreacion: date })),
  total: deployedCounts,
});

function validationError(issues: z.ZodIssue[]) {
  // Schema paths/codes/types only; never payload values or Zod messages.
  const details = issues.slice(0, 5).map((issue) => {
    const path = ["cohorteDiariaVsl", ...issue.path].join(".");
    return issue.code === "invalid_type"
      ? `${path}: esperado ${issue.expected}, recibido ${issue.received}`
      : `${path}: ${issue.code}`;
  });
  return `La API entregó una cohorte diaria de Landing VSL incompleta o incompatible. ${details.join("; ")}`;
}

export function mapLandingVslCohort(
  value: unknown,
  filters: Pick<ReportFilters, "dateFrom" | "dateTo">,
  expectedTotal?: number,
): { cohorteDiariaVsl?: LandingVslCohort; cohorteDiariaVslError?: string } {
  const error = (message: string) => ({ cohorteDiariaVslError: message });
  if (value == null) return error("La API no entrega la cohorte diaria de Landing VSL.");
  let normalized = value;
  const usesDeployedContract = typeof value === "object" && "total" in value;
  if (usesDeployedContract) {
    const deployed = deployedSchema.safeParse(value);
    if (!deployed.success) return error(validationError(deployed.error.issues));
    const source = deployed.data;
    for (const key of ["oportunidades", "asistidos", "noAsistidos", "sinResultado"] as const) {
      if (source.porDia.reduce((sum, day) => sum + day[key], 0) !== source.total[key])
        return error("Los totales de la cohorte diaria no concilian con los días de la API.");
    }
    normalized = {
      totalLeads: source.total.oportunidades,
      porDia: source.porDia.map((day) => ({
        fecha: day.fechaCreacion,
        totalLeads: day.oportunidades,
        leadsAsistidos: day.asistidos,
        leadsNoAsistidos: day.noAsistidos,
        leadsPendientesResultado: day.sinResultado,
        porcentajeAsistencia: day.oportunidades
          ? Number(((day.asistidos * 100) / day.oportunidades).toFixed(2))
          : 0,
      })),
    };
  }
  const result = schema.safeParse(normalized);
  if (!result.success) return error(validationError(result.error.issues));
  const data = result.data;
  const days = new Set<string>();
  const ids = new Set<string>();
  const appointmentIds = new Set<string>();
  for (const day of data.porDia) {
    if (
      days.has(day.fecha) ||
      (filters.dateFrom && day.fecha < filters.dateFrom) ||
      (filters.dateTo && day.fecha > filters.dateTo) ||
      day.leadsAsistidos + day.leadsNoAsistidos + day.leadsPendientesResultado !== day.totalLeads ||
      Math.abs(
        day.porcentajeAsistencia -
          (day.totalLeads ? (day.leadsAsistidos * 100) / day.totalLeads : 0),
      ) > 0.011
    )
      return error("La cohorte diaria no concilia con las fechas o los totales de la API.");
    days.add(day.fecha);
    if (!day.leads) continue;
    if (day.leads.length !== day.totalLeads)
      return error("El detalle diario de Landing VSL está incompleto.");
    let attended = 0,
      missed = 0;
    for (const row of day.leads) {
      if (ids.has(row.opportunityId) || row.fechaCreacion !== day.fecha)
        return error("El detalle diario contiene oportunidades repetidas o fechas inconsistentes.");
      ids.add(row.opportunityId);
      for (const appt of row.citas) {
        if (appointmentIds.has(appt.appointmentId))
          return error("El detalle diario contiene citas repetidas.");
        appointmentIds.add(appt.appointmentId);
      }
      const outcome = row.citas.some((a) => a.estadoAgenda === "Asistió")
        ? "Asistió"
        : row.citas.some((a) => a.estadoAgenda === "No asistió")
          ? "No asistió"
          : row.citas.length
            ? "Sin resultado"
            : "Pendiente de agenda";
      if (row.resultadoAsistencia !== outcome)
        return error("El resultado de asistencia no concilia con las citas vinculadas.");
      if (outcome === "Asistió") attended++;
      if (outcome === "No asistió") missed++;
    }
    if (attended !== day.leadsAsistidos || missed !== day.leadsNoAsistidos)
      return error("Los resultados del detalle no concilian con el resumen diario.");
  }
  if (
    data.porDia.reduce((sum, day) => sum + day.totalLeads, 0) !== data.totalLeads ||
    (expectedTotal != null && data.totalLeads !== expectedTotal)
  )
    return error("El total diario no coincide con la cohorte seleccionada de Landing VSL.");
  return {
    cohorteDiariaVsl: {
      ...data,
      porDia: [...data.porDia].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    },
  };
}
