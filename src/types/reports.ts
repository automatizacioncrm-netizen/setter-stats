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

export type DatePreset = "hoy" | "ayer" | "7dias" | "mes" | "mesPasado" | "custom" | "todos";

export type LeadType = "all" | "paid" | "organic";
export type Pipeline = "all" | "vsl" | "oei" | "lig";

export interface ReportFilters {
  pipeline?: Pipeline;
  calendar?: string;
  leadType: LeadType;
  preset: DatePreset;
  dateFrom: string;
  dateTo: string;
  setter: string;
  booker: string;
  estadoAgenda: string;
  vslOrigen: string;
  vslTipo?: string;
  closer: string;
}

export interface LeadTypeKpis {
  totalLeads: number;
  totalAppointments?: number;
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
  setterEfectivo?: string;
  agendadoPor?: string;
  agendadoCRM: number;
  confirmado?: number;
  asistio: number;
  cancelado: number;
  noShow: number;
  pendienteAgenda: number;
  reagendado: number;
  total: number;
}

/** Compatibility contract used by the existing standalone report client. */
export interface VslReport {
  report: string;
  leadType: LeadType;
  updatedAt?: string;
  filters?: {
    applied?: Partial<ReportFilters> & { status?: string; vslOrigin?: string };
    available?: Record<string, string[]>;
  };
  kpis: Partial<ReportKpis> &
    Pick<
      ReportKpis,
      "total" | "asistio" | "cancelado" | "noShow" | "tasaAsistencia" | "tasaNoShow"
    >;
  setters?: (Partial<SetterRow> &
    Pick<SetterRow, "setter" | "total" | "asistio" | "cancelado" | "noShow">)[];
  sales?: Partial<SalesReport>;
  detail?: LeadDetailRow[];
  pagination?: { page?: number; pageSize?: number; totalDetail?: number; totalPages?: number };
  pipelineSummary?: Record<string, unknown>;
}

export interface VslReportResponse {
  ok: boolean;
  data?: VslReport;
}

export interface VslClosersReport {
  rawRecords?: LeadDetailRow[];
  vslSummary?: Record<
    LeadType,
    { totalLeads: number; totalCitas: number; asistencias: number; ventas: number }
  >;
  dateSemantics?: {
    leads: string;
    appointments: string;
    appointmentsFallback: string;
    sales: string;
    salesFallback?: string;
    paymentDate?: string;
  };
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
  availableBookers: string[];
  availableClosers: string[];
  availableOrigins: string[];
  availableCalendars?: string[];
  availableStatuses?: string[];
  pipelineSummary?: Record<string, unknown>;
  appointmentPeople?: {
    oeiBookers: AppointmentPersonCount[];
    ligBookers?: AppointmentPersonCount[];
    bookers?: AppointmentPersonCount[];
    closers: AppointmentPersonCount[];
  };
  unknownStatusCount: number;
  source: "development" | "sheet";
  detail?: LeadDetailRow[];
  detailTotal: number;
  detailPage: number;
}

export interface AppointmentPersonCount extends Partial<Omit<SetterRow, "setter" | "total">> {
  name: string;
  total: number;
}

export type AppointmentDateField = "appointmentCreated" | "meetingDate";
export type BookingMode = "automatic" | "manual";

export type AppointmentDetailFilters = {
  pipeline: Pipeline;
  leadType: LeadType;
  setter: string;
  booker: string;
  status?: string;
  calendar: string;
  dateFrom: string;
  dateTo: string;
  dateField?: AppointmentDateField;
  bookingMode?: BookingMode | "";
  dayGap?: string;
  closer: string;
  vslOrigin: string;
  vslTipo?: string;
  search: string;
};
export interface AppointmentDetailRow {
  appointmentId?: string;
  opportunityId?: string;
  contactId?: string;
  nombreContacto?: string;
  telefono?: string;
  correo?: string;
  pipeline?: string;
  secuencia?: string;
  agendadoPor?: string;
  setterEfectivo?: string;
  creadoPorCitaNormalizado?: string;
  bookingMode?: BookingMode;
  bookingModeLabel?: string;
  diferenciaDias?: number | null;
  diferenciaDiasLabel?: string;
  vslOrigen?: string;
  setterAsignado?: string;
  creadoPorCita?: string;
  calendario?: string;
  estado?: string;
  fechaCreacionCita?: string;
  fechaReunion?: string;
  fechaCita?: string;
  closer?: string;
  closerCita?: string;
  closerOpportunity?: string;
  leadType?: string;
  vslCategoria?: string;
}
export interface AppointmentDetailResponse {
  filters?: {
    applied?: Partial<AppointmentDetailFilters>;
    available?: {
      dateFields?: { value: AppointmentDateField; label: string }[];
      bookingModes?: { value: BookingMode; label: string }[];
      dayGaps?: { value: string; label: string; days: number | null }[];
    };
  };
  rows: AppointmentDetailRow[];
  pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number };
  summary: {
    total: number;
    confirmado: number;
    asistio: number;
    cancelado: number;
    noShow: number;
    tasaAsistencia: number;
  };
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
  appointmentCreatedAt?: string;
  vslCategoria?: "paid" | "organic";
  vslOrigen?: string;
  pipeline: string;
  secuencia: string;
  calendarioCita: string;
  productoEvento: string;
  fechaVenta?: string;
  fechaPrimerPago: string;
  planPagos: string;
  numeroCuotasPactadas: number;
  moneda: string;
  montoTotalAcordado: number;
  montoUltimoPago: number;
  setterAsignado: string;
  agendadorCita: string;
  createdByUserName: string;
  closerAsignado: string;
  closerCita: string;
  nombreContacto: string;
  fase: string;
  fuente: string;
  fechaCita: string;
  fechaAgendamiento: string;
  estadoAgenda: string;
  estadoCita: string;
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
  appointmentCreatedAt?: string;
  vslCategoria?: "paid" | "organic";
  asignado?: string;
  creadoPorCita?: string;
  planPago?: string;
  numeroCuotas?: number;
  fechaCreacionOportunidad?: string;
  pipeline?: string;
  secuencia?: string;
  nombreContacto: string;
  telefono: string;
  correo: string;
  setterAsignado: string;
  agendadorCita?: string;
  createdByUserName?: string;
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
  fechaVenta?: string;
  fechaPrimerPago?: string;
  planPagos?: string;
  numeroCuotasPactadas?: number;
  moneda?: string;
  montoTotalAcordado?: number;
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
