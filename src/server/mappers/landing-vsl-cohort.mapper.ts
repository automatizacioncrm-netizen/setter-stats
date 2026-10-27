import { z } from "zod";
import type { LandingVslCohort, ReportFilters } from "../../types/reports";

const count = z.number().finite().int().nonnegative();
// Optional for older deployments, never defaulted or inferred from other counts.
const additionalCounts = {
  oportunidadesConCita: count.optional(),
  confirmados: count.optional(),
  cancelados: count.optional(),
};
const deployedCounts = z.object({
  oportunidades: count,
  asistidos: count,
  noAsistidos: count,
  sinResultado: count,
  ...additionalCounts,
});
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
const consolidatedState = z.enum([
  "Asistió",
  "No asistió",
  "Cancelado",
  "Confirmado",
  "Sin resultado",
]);
const attributionFields = {
  setterAsignado: z.string().optional(),
  creadorCita: z.string().optional(),
  agendadorCita: z.string().optional(),
  closerAsignado: z.string().optional(),
  calendarioCita: z.string().optional(),
  estadoCita: z.string().optional(),
  estadoAgenda: z.string().optional(),
  appointmentCreatedAt: date.or(z.literal("")).optional(),
  fechaCita: date.or(z.literal("")).optional(),
};
const cohortAppointment = z
  .object({
    appointmentId: z.string().trim().min(1),
    opportunityId: z.string().optional(),
    fechaReunion: date.or(z.literal("")),
    fechaCreacionCita: date.or(z.literal("")).optional(),
    estado: z.string().optional(),
    estadoConsolidado: z.string().optional(),
    closerCita: z.string().optional(),
    bookingMode: z.string().optional(),
    ...attributionFields,
  })
  .passthrough();
const deployedLeadDetail = z
  .object({
    opportunityId: z.string().trim().min(1),
    nombreContacto: z.string(),
    correo: z.string(),
    telefono: z.string(),
    estado: consolidatedState,
    estadoConsolidado: consolidatedState.optional(),
    fechaReunion: date.or(z.literal("")),
    fechaCreacion: date,
    contactId: z.string().optional(),
    fechaCreacionOportunidad: date.optional(),
    pipeline: z.literal("vsl").optional(),
    secuencia: z.string().optional(),
    fuente: z.string().optional(),
    vslOrigen: z.string().optional(),
    fase: z.string().optional(),
    setterOpportunity: z.string().optional(),
    closerOpportunity: z.string().optional(),
    fechaAgendamiento: date.or(z.literal("")).optional(),
    appointmentId: z.string().optional(),
    tieneCita: z.boolean().optional(),
    numeroCitas: count.optional(),
    ...attributionFields,
    citas: z.array(cohortAppointment),
  })
  .passthrough();
const schema = z.object({
  totalLeads: count,
  total: deployedCounts.optional(),
  porDia: z.array(
    z.object({
      fecha: date,
      totalLeads: count,
      leadsAsistidos: count,
      leadsNoAsistidos: count,
      leadsPendientesResultado: count,
      porcentajeAsistencia: z.number().finite().min(0).max(100),
      ...additionalCounts,
      // A summary without individual records remains useful, but never invent detail.
      leads: z.array(lead).optional(),
      detalles: z.array(deployedLeadDetail).optional(),
    }),
  ),
});

// Deployed Apps Script contract supplied by the user. These are opportunity
// counts; citasAsistidas/citasNoAsistidas count appointments and are not used.
const deployedSchema = z.object({
  pipeline: z.literal("vsl"),
  porDia: z.array(
    deployedCounts.extend({
      fechaCreacion: date,
      detalles: z.array(deployedLeadDetail).optional(),
    }),
  ),
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
      total: source.total,
      porDia: source.porDia.map((day) => ({
        fecha: day.fechaCreacion,
        totalLeads: day.oportunidades,
        leadsAsistidos: day.asistidos,
        leadsNoAsistidos: day.noAsistidos,
        leadsPendientesResultado: day.sinResultado,
        ...(day.oportunidadesConCita !== undefined
          ? { oportunidadesConCita: day.oportunidadesConCita }
          : {}),
        ...(day.confirmados !== undefined ? { confirmados: day.confirmados } : {}),
        ...(day.cancelados !== undefined ? { cancelados: day.cancelados } : {}),
        ...(day.detalles !== undefined ? { detalles: day.detalles } : {}),
        porcentajeAsistencia: day.oportunidades
          ? Number(((day.asistidos * 100) / day.oportunidades).toFixed(2))
          : 0,
      })),
    };
  }
  const result = schema.safeParse(normalized);
  if (!result.success) return error(validationError(result.error.issues));
  const data = result.data;
  for (const field of ["oportunidadesConCita", "confirmados", "cancelados"] as const) {
    const expected = data.total?.[field];
    if (
      expected !== undefined &&
      data.porDia.every((day) => day[field] !== undefined) &&
      data.porDia.reduce((sum, day) => sum + day[field]!, 0) !== expected
    )
      return error(`El total de ${field} no concilia con los días de la API.`);
  }
  const days = new Set<string>();
  const ids = new Set<string>();
  const appointmentIds = new Set<string>();
  const detailAppointmentIds = new Set<string>();
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
    if (day.detalles !== undefined) {
      if (day.detalles.length !== day.totalLeads)
        return error(
          `El detalle diario de ${day.fecha} está incompleto: no coincide con oportunidades.`,
        );
      const detailIds = new Set<string>();
      let attended = 0,
        missed = 0,
        pending = 0,
        confirmed = 0,
        cancelled = 0;
      for (const row of day.detalles) {
        if (
          detailIds.has(row.opportunityId) ||
          ids.has(row.opportunityId) ||
          row.fechaCreacion !== day.fecha ||
          (row.fechaCreacionOportunidad !== undefined && row.fechaCreacionOportunidad !== day.fecha)
        )
          return error(
            `El detalle diario de ${day.fecha} contiene oportunidades repetidas o fechas inconsistentes.`,
          );
        detailIds.add(row.opportunityId);
        // Validate the consolidated states delivered by Apps Script. Do not
        // derive or replace them from appointment history in the frontend.
        const state = row.estadoConsolidado ?? row.estado;
        if (state === "Asistió") attended++;
        else if (state === "No asistió") missed++;
        else pending++;
        if (state === "Confirmado") confirmed++;
        if (state === "Cancelado") cancelled++;
        for (const appt of row.citas) {
          if (appt.opportunityId !== undefined && appt.opportunityId !== row.opportunityId)
            return error(
              `El historial del detalle de ${day.fecha} contiene citas de otra oportunidad.`,
            );
          if (detailAppointmentIds.has(appt.appointmentId))
            return error(`El detalle diario de ${day.fecha} contiene citas repetidas.`);
          detailAppointmentIds.add(appt.appointmentId);
        }
      }
      if (
        attended !== day.leadsAsistidos ||
        missed !== day.leadsNoAsistidos ||
        pending !== day.leadsPendientesResultado ||
        (day.confirmados !== undefined && confirmed !== day.confirmados) ||
        (day.cancelados !== undefined && cancelled !== day.cancelados)
      )
        return error(
          `Los estados consolidados del detalle de ${day.fecha} no concilian con el resumen diario de la API.`,
        );
      if (!day.leads) for (const id of detailIds) ids.add(id);
    }
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
