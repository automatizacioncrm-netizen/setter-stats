export const ESTADOS_AGENDA = [
  "Agendado CRM",
  "Asistió",
  "Cancelado",
  "No show",
  "Pendiente de agenda",
  "Reagendado",
  "Confirmado",
  "No asistió",
] as const;

export type EstadoAgenda = (typeof ESTADOS_AGENDA)[number];

export type DatePreset = "hoy" | "ayer" | "7dias" | "mes" | "custom" | "todos";

export type LeadType = "all" | "paid" | "organic";
export type Pipeline = "all" | "vsl" | "oei";

export interface ReportFilters {
  pipeline?: Pipeline;
  calendar?: string;
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
  confirmado?: number;
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
  confirmado?: number;
  asistio: number;
  cancelado: number;
  noShow: number;
  pendienteAgenda: number;
  reagendado: number;
  total: number;
}

export interface VslClosersReport {
  sales: SalesReport;
  salesAvailable: boolean;
  leadType: LeadType;
  report: string;
  updatedAt: string;
  filters: Omit<ReportFilters, "preset">;
  kpis: ReportKpis;
  leadTypeKpis: LeadTypeKpis;
  setters: SetterRow[];
  availableSetters: string[];
  availableClosers: string[];
  availableOrigins: string[];
  availableCalendars?: string[];
  availableStatuses?: string[];
  pipelineSummary?: Record<string, unknown>;
  unknownStatusCount: number;
  source: "development" | "sheet";
  detail?: LeadDetailRow[];
  detailTotal: number;
  detailPage: number;
}

export const SALES_STAGES = [
  "Reserva / Deposito",
  "Venta - Pagando a Cuotas",
  "Venta Cerrada (Pago De Contado)",
  "Venta Cerrada (Cuotas Pagadas)",
  "Perdida",
] as const;

export interface SalesStageSummary {
  stage: string;
  count: number;
}

export interface SaleRow {
  productoEvento: string;
  moneda: string;
  montoUltimoPago: number;
  setterAsignado: string;
  closerAsignado: string;
  nombreContacto: string;
  fase: string;
  fuente: string;
  fechaReunion: string;
}

export interface SalesReport {
  productSummary: SalesProductSummary[];
  salesValueByCurrency: SalesValueByCurrency[];
  cashByCurrency: { currency: string; amount: number }[];
  total: number;
  byStage: SalesStageSummary[];
  rows: SaleRow[];
}

export interface SalesProductSummary {
  producto: string;
  cantidad: number;
  moneda: string;
  ticket: number;
  valorVenta: number;
  cashRecaudado: number;
  porcentajeRecaudado: number;
}
export interface SalesValueByCurrency {
  currency: string;
  salesValue: number;
  cashCollected: number;
  collectedRate: number;
}

export interface LeadDetailRow {
  pipeline?: string;
  secuencia?: string;
  nombreContacto: string;
  telefono: string;
  correo: string;
  setterAsignado: string;
  closerAsignado: string;
  closerOpportunity?: string;
  closerCita?: string;
  calendarioCita?: string;
  vslOrigen: string;
  estadoAgenda: string;
  estadoCita?: string;
  estadoAgendaOriginal?: string;
  fuenteEstadoAgendamiento?: string;
  fechaAgendamiento?: string;
  fechaCita?: string;
  fechaReunion: string;
  fase: string;
  fuente: string;
  productoEvento?: string;
  moneda?: string;
  montoUltimoPago?: number;
  leadType?: string;
}
export interface DetailQuery {
  includeDetail: boolean;
  search: string;
  page: number;
  pageSize: number;
  sort:
    | "nombreContacto"
    | "telefono"
    | "correo"
    | "setterAsignado"
    | "closerAsignado"
    | "vslOrigen"
    | "estadoAgenda"
    | "fechaReunion"
    | "fase"
    | "fuente";
  direction: "asc" | "desc";
}
export type SheetRow = Record<string, unknown>;

export interface RawRecord {
  id: string;
  fechaReunion: string; // YYYY-MM-DD
  setter: string;
  estadoAgenda: EstadoAgenda;
}
