import { ApiError, getServerEnv } from "../config/env.server";
export const REPORT_TIMEOUT_MS = 15_000;
export const RECONCILE_TIMEOUT_MS = 60_000;
export interface ReportRequest {
  leadType: "paid" | "organic";
  dateFrom: string;
  dateTo: string;
  setter: string;
  status: string;
  vslOrigin: string;
  closer: string;
  search: string;
  page: number;
  pageSize: number;
}

async function requestScript(action: "vsl_report" | "vsl_reconciliar", filters?: ReportRequest) {
  const env = getServerEnv();
  const url = new URL(env.APPS_SCRIPT_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("key", env.APPS_SCRIPT_SECRET);
  if (filters)
    for (const key of [
      "leadType",
      "dateFrom",
      "dateTo",
      "setter",
      "status",
      "vslOrigin",
      "closer",
      "search",
      "page",
      "pageSize",
    ] as const) {
      url.searchParams.set(key, String(filters[key]));
    }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    action === "vsl_report" ? REPORT_TIMEOUT_MS : RECONCILE_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, {
      method: action === "vsl_report" ? "GET" : "POST",
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok) throw new ApiError("Apps Script respondió con un error HTTP.");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("ok" in body) || body.ok !== true)
      throw new ApiError("Apps Script no pudo completar la operación.");
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? "Apps Script excedió el tiempo de espera. Consulta el reporte antes de reintentar la actualización."
        : "No se pudo obtener una respuesta JSON válida de Apps Script.",
      controller.signal.aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timer);
  }
}
export function fetchVslReport(filters: ReportRequest) {
  return requestScript("vsl_report", filters);
}
export function runVslReconciliation() {
  return requestScript("vsl_reconciliar");
}
