import type { VslReport, VslReportResponse } from "@/types/reports";

export interface VslReportFilters {
  leadType?: string;
  pipeline?: string;
  calendar?: string;
  dateFrom?: string;
  dateTo?: string;
  setter?: string;
  closer?: string;
  status?: string;
  vslOrigin?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getVslReport(
  filters: VslReportFilters = {},
  signal?: AbortSignal,
): Promise<VslReport> {
  const apiUrl = import.meta.env["APPS_SCRIPT_URL"];
  const secret = import.meta.env["APPS_SCRIPT_SECRET"];
  if (!apiUrl || !secret) {
    throw new Error(
      "Configura APPS_SCRIPT_URL y APPS_SCRIPT_SECRET para consultar el reporte.",
    );
  }
  const url = new URL(apiUrl);
  const params = new URLSearchParams({
    action: "vsl_report",
    frontend_secret: secret,
    leadType: filters.leadType ?? "all",
    pipeline: filters.pipeline ?? "all",
    calendar: filters.calendar ?? "",
    dateFrom: filters.dateFrom ?? "",
    dateTo: filters.dateTo ?? "",
    setter: filters.setter ?? "",
    closer: filters.closer ?? "",
    status: filters.status ?? "",
    vslOrigin: filters.vslOrigin ?? "",
    search: filters.search ?? "",
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 25),
  });
  params.forEach((value, key) => url.searchParams.set(key, value));
  const httpResponse = await fetch(url, { ...(signal ? { signal } : {}), cache: "no-store" });
  let response: VslReportResponse & { error?: string };
  try {
    response = await httpResponse.json();
  } catch {
    throw new Error("La API no devolvió una respuesta JSON válida.");
  }
  // Temporary diagnostic requested to inspect the single Apps Script envelope.
  if (import.meta.env.DEV) console.log("VSL REPORT RESPONSE", response);
  if (!httpResponse.ok || response?.ok !== true) {
    throw new Error(typeof response?.error === "string" ? response.error : "No se pudo cargar el reporte.");
  }
  if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
    throw new Error("La API no devolvió el reporte dentro de data.");
  }
  return response.data;
}
