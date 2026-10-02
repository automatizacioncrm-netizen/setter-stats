import { getEffectiveSetter, getEffectiveVslOrigin } from "../lib/report-record";
import type {
  AppointmentDetailFilters,
  AppointmentDetailResponse,
  DetailQuery,
  ReportFilters,
  VslClosersReport,
} from "@/types/reports";

export function getSetterApiValue(setterName?: string): string {
  if (!setterName) return "";

  const normalized = setterName.trim().toLocaleLowerCase("es");
  if (normalized === "sin setter" || normalized === "sin setter asignado") {
    return "__SIN_SETTER__";
  }

  return setterName;
}

export function appointmentDetailFilters(
  filters: ReportFilters,
  person?: string,
  status?: string,
): AppointmentDetailFilters {
  const pipeline = filters.pipeline ?? "all";
  const personSelected = person !== undefined;
  const usesBooker = pipeline === "oei" || pipeline === "lig";
  const detailStatus = personSelected ? status : (status ?? filters.estadoAgenda);
  return {
    pipeline,
    leadType: filters.leadType,
    setter: personSelected && !usesBooker ? getSetterApiValue(person) : filters.setter,
    booker: personSelected && usesBooker ? person : filters.booker,
    // A row's name or total intentionally requests every status for that person.
    ...(detailStatus ? { status: detailStatus } : {}),
    calendar: filters.calendar ?? "",
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    closer: filters.closer,
    vslOrigin: filters.vslOrigen,
    ...(filters.vslTipo !== undefined ? { vslTipo: filters.vslTipo } : {}),
    search: "",
  };
}

export async function getAppointmentDetail(
  filters: AppointmentDetailFilters,
  page = 1,
  signal?: AbortSignal,
): Promise<AppointmentDetailResponse> {
  const params = new URLSearchParams(
    Object.entries({ ...filters, action: "appointment_detail", page, pageSize: 50 })
      .filter(
        ([key, value]) =>
          value != null &&
          !(key === "status" && value === "") &&
          (key !== "leadType" || filters.pipeline === "vsl"),
      )
      .map(([key, value]) => [key, String(value)]),
  );
  return readResponse<AppointmentDetailResponse>(
    await fetch(`/api/reports/vsl-closers?${params}`, {
      ...(signal ? { signal } : {}),
      cache: "no-store",
    }),
  );
}
export async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || body?.ok === false) {
    const message = body?.message || "No se pudo completar la solicitud.";
    // The server includes sanitized diagnostics only outside production.
    throw new Error(typeof body?.details === "string" ? `${message}: ${body.details}` : message);
  }
  return body as T;
}
export async function getVslClosersReport(
  filters: ReportFilters,
  detail: DetailQuery,
  signal?: AbortSignal,
): Promise<VslClosersReport> {
  const { estadoAgenda: status, vslOrigen: vslOrigin, preset: _preset, ...rest } = filters;
  const params = new URLSearchParams(
    Object.entries({ ...rest, pipeline: filters.pipeline ?? "all", status, vslOrigin, ...detail })
      .filter(
        ([key, value]) =>
          value != null &&
          (key !== "leadType" || filters.pipeline === undefined || filters.pipeline === "vsl"),
      )
      .map(([k, v]) => [k, String(v)]),
  );
  const report = await readResponse<VslClosersReport>(
    await fetch(`/api/reports/vsl-closers?${params}`, {
      ...(signal ? { signal } : {}),
      cache: "no-store",
    }),
  );
  // Keep complete API options; supplement with effective names from received records.
  // Filtering and pagination remain authoritative on the API.
  const records = [
    ...(report.rawRecords ?? []),
    ...(report.detail ?? []),
    ...(report.sales?.rows ?? []),
  ];
  return {
    ...report,
    availableOrigins: [
      ...new Set(
        [
          ...(report.availableOrigins ?? []),
          ...records.filter((record) => record.pipeline === "vsl").map(getEffectiveVslOrigin),
        ].filter(Boolean),
      ),
    ],
    availableSetters: [
      ...new Set(
        [...(report.availableSetters ?? []), ...records.map(getEffectiveSetter)].filter(Boolean),
      ),
    ],
  };
}
