export interface DailyMeetingTotals {
  totalCitas: number;
  confirmados: number;
  cancelados: number;
  asistidos: number;
  noAsistidos: number;
  sinEstado: number;
  porcentajeAsistencia?: number | null | undefined;
}
export interface DailyMeeting {
  appointmentId: string;
  opportunityId: string;
  nombreContacto: string;
  telefono: string;
  correo: string;
  pipeline: string;
  embudo: string;
  calendario: string;
  setter: string;
  agendadorCita: string;
  closer: string;
  estado: string;
  fechaReunion: string;
  fechaCreacionCita: string;
  fase: string;
}
export interface DailyMeetingDay extends DailyMeetingTotals {
  fechaReunion: string;
  detalles: DailyMeeting[];
}
export interface DailyMeetingsReport {
  criterioFecha: "meetingDate";
  unidad: "appointmentId";
  alcance: "todos_los_embudos_permitidos" | "embudo_seleccionado";
  pipeline: Pipeline;
  dateFrom: string;
  dateTo: string;
  porDia: DailyMeetingDay[];
  total: DailyMeetingTotals;
  diasConCitas: number;
  warnings: string[];
}
import type { Pipeline } from "./reports";
export interface DailyMeetingsFilters {
  pipeline: Pipeline;
  dateFrom: string;
  dateTo: string;
  calendar?: string | undefined;
}
