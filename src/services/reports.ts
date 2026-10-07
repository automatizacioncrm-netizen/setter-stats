import { readCombinedPage } from "../lib/paginated-sources";
import { mergeFilteredReports } from "../lib/merge-filtered-reports";
import { isValidReportRange } from "../lib/report-filter-state";
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
  const automatic = person === "Agendado automático" || person === "Agendado automatico";
  const detailStatus = personSelected ? status : (status ?? filters.estadoAgenda);
  return {
    pipeline,
    leadType: filters.leadType,
    setter: automatic
      ? ""
      : personSelected && !usesBooker
        ? getSetterApiValue(person)
        : filters.setter,
    booker: automatic ? "" : personSelected && usesBooker ? person : filters.booker,
    bookingMode: automatic ? "automatic" : "",
    dateField: "appointmentCreated",
    dayGap: "",
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
  sourceNames?: string[],
): Promise<AppointmentDetailResponse> {
  if (sourceNames?.length && (filters.pipeline === "oei" || filters.pipeline === "lig")) {
    const usesBooker = filters.pipeline === "oei" || filters.pipeline === "lig";
    const names = [
      ...new Set(sourceNames.map((name) => (usesBooker ? name : getSetterApiValue(name)))),
    ];
    const sourceFilters = names.map((name) => ({
      ...filters,
      ...(usesBooker ? { booker: name } : { setter: name }),
    }));
    if (sourceFilters.length === 1) return getAppointmentDetail(sourceFilters[0]!, page, signal);

    // Exact-name API queries remain independently paginated. Read their counts,
    // then fetch only the slices needed to fill one combined page of 50 records.
    const firstPages = await Promise.all(
      sourceFilters.map((source) => getAppointmentDetail(source, 1, signal)),
    );
    const combined = await readCombinedPage(
      firstPages.map((result) => ({
        totalRecords: result.pagination.totalRecords,
        rows: result.rows,
      })),
      page,
      50,
      async (index, sourcePage) =>
        (await getAppointmentDetail(sourceFilters[index]!, sourcePage, signal)).rows,
    );
    const summary = firstPages.reduce(
      (sum, result) => ({
        total: sum.total + result.summary.total,
        confirmado: sum.confirmado + result.summary.confirmado,
        asistio: sum.asistio + result.summary.asistio,
        cancelado: sum.cancelado + result.summary.cancelado,
        noShow: sum.noShow + result.summary.noShow,
        tasaAsistencia: 0,
      }),
      { total: 0, confirmado: 0, asistio: 0, cancelado: 0, noShow: 0, tasaAsistencia: 0 },
    );
    summary.tasaAsistencia =
      summary.total > 0 ? Math.round((summary.asistio / summary.total) * 10000) / 100 : 0;
    return {
      ...combined,
      summary,
    };
  }
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
  sourceNames?: string[],
): Promise<VslClosersReport> {
  if (!isValidReportRange(filters))
    throw new Error("Revisa el rango de fechas: Desde debe ser anterior o igual a Hasta.");
  if (sourceNames?.length) {
    const usesBooker = filters.pipeline === "oei" || filters.pipeline === "lig";
    const sources = [
      ...new Set(sourceNames.map((name) => (usesBooker ? name : getSetterApiValue(name)))),
    ];
    const sourceFilters = sources.map((name) => ({
      ...filters,
      ...(usesBooker ? { booker: name } : { setter: name }),
    }));
    if (sourceFilters.length === 1) return getVslClosersReport(sourceFilters[0]!, detail, signal);
    const firstPages = await Promise.all(
      sourceFilters.map((source) => getVslClosersReport(source, { ...detail, page: 1 }, signal)),
    );
    const merged = mergeFilteredReports(firstPages, filters);
    if (detail.includeDetail) {
      const combined = await readCombinedPage(
        firstPages.map((report) => ({
          totalRecords: report.detailTotal,
          rows: report.detail ?? [],
        })),
        detail.page,
        detail.pageSize,
        async (index, page) =>
          (await getVslClosersReport(sourceFilters[index]!, { ...detail, page }, signal)).detail ??
          [],
      );
      merged.detail = combined.rows;
      merged.detailPage = combined.pagination.page;
    }
    return merged;
  }
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
  return readResponse<VslClosersReport>(
    await fetch(`/api/reports/vsl-closers?${params}`, {
      ...(signal ? { signal } : {}),
      cache: "no-store",
    }),
  );
}
