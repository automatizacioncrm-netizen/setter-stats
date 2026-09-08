export const ESTADOS_AGENDA = [
  "Agendado CRM",
  "Asistió",
  "Cancelado",
  "No show",
  "Pendiente de agenda",
  "Reagendado",
] as const;

export type EstadoAgenda = (typeof ESTADOS_AGENDA)[number];

export type DatePreset = "hoy" | "ayer" | "7dias" | "mes" | "custom" | "todos";

export type LeadType = "paid" | "organic";

export interface ReportFilters {
  leadType: LeadType;
  preset: DatePreset;
  dateFrom: string;
  dateTo: string;
  setter: string;
  estadoAgenda: string;
  vslOrigen: string;
  closer: string;
}

export interface LeadTypeKpis {
  totalLeads: number;
  attended: number;
  attendanceRate: number;
}

export interface ReportKpis {
  totalLeads: number;
  conEstadoAgenda: number;
  /** Compatibility alias for conEstadoAgenda: only leads with a valid agenda status. */
  total: number;
  agendadoCRM: number;
  asistio: number;
  cancelado: number;
  noShow: number;
  pendienteAgenda: number;
  reagendado: number;
  tasaAsistencia: number;
  tasaNoShow: number;
}

export interface SetterRow {
  setter: string;
  agendadoCRM: number;
  asistio: number;
  cancelado: number;
  noShow: number;
  pendienteAgenda: number;
  reagendado: number;
  total: number;
}

export interface VslClosersReport {
  leadType: LeadType;
  report: "VSL | CLOSERS";
  updatedAt: string;
  filters: Omit<ReportFilters, "preset">;
  kpis: ReportKpis;
  leadTypeKpis: LeadTypeKpis;
  setters: SetterRow[];
  availableSetters: string[];
  availableClosers: string[];
  availableOrigins: string[];
  unknownStatusCount: number;
  source: "development" | "sheet";
  detail?: LeadDetailRow[];
  detailTotal: number;
  detailPage: number;
}

export interface LeadDetailRow {
  nombreContacto: string;
  telefono: string;
  correo: string;
  setterAsignado: string;
  closerAsignado: string;
  vslOrigen: string;
  estadoAgenda: string;
  fechaReunion: string;
  fase: string;
  fuente: string;
}
export interface DetailQuery {
  includeDetail: boolean;
  search: string;
  page: number;
  pageSize: number;
  sort: keyof LeadDetailRow;
  direction: "asc" | "desc";
}
export type SheetRow = Record<string, unknown>;

export interface RawRecord {
  id: string;
  fechaReunion: string; // YYYY-MM-DD
  setter: string;
  estadoAgenda: EstadoAgenda;
}
