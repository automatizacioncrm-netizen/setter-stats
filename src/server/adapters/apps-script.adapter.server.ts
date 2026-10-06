import { ApiError, getServerEnv } from "../config/env.server";
export const REPORT_TIMEOUT_MS = 15_000;
export const RECONCILE_TIMEOUT_MS = 60_000;
export interface ReportRequest {
  pipeline: "all" | "vsl" | "oei" | "lig";
  leadType: "all" | "paid" | "organic";
  calendar: string;
  dateFrom: string;
  dateTo: string;
  setter: string;
  booker?: string;
  status: string;
  vslOrigin: string;
  closer: string;
  includeDetail: boolean;
  search: string;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
}
export type AppointmentDetailRequest = Omit<
  ReportRequest,
  "includeDetail" | "sort" | "direction"
> & {
  vslTipo?: string | undefined;
  dateField?: "appointmentCreated" | "meetingDate" | undefined;
};

async function requestScript(
  action: "vsl_report" | "appointment_detail" | "reconcile_all",
  filters?: ReportRequest | AppointmentDetailRequest,
) {
  const env = getServerEnv();
  const url = new URL(env.APPS_SCRIPT_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("key", env.APPS_SCRIPT_SECRET);
  if (filters)
    for (const key of [
      "pipeline",
      "leadType",
      "calendar",
      "dateFrom",
      "dateTo",
      "setter",
      "booker",
      "status",
      "vslOrigin",
      ...(action === "appointment_detail" ? ["vslTipo" as const, "dateField" as const] : []),
      "closer",
      "includeDetail",
      "search",
      "page",
      "pageSize",
      "sort",
      "direction",
    ] as const) {
      if (key === "leadType" && filters.pipeline && filters.pipeline !== "vsl") continue;
      if (!(key in filters)) continue;
      const value = (filters as unknown as Record<string, unknown>)[key];
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
  const controller = new AbortController();
  const startedAt = Date.now();
  const redact = (value: string) =>
    value
      .replaceAll(env.APPS_SCRIPT_SECRET, "[REDACTED]")
      .replaceAll(encodeURIComponent(env.APPS_SCRIPT_SECRET), "[REDACTED]")
      .replace(/([?&](?:key|token|secret|frontend_secret)=)[^&\s"<>]*/gi, "$1[REDACTED]")
      .replace(
        /("(?:key|token|secret|frontend_secret|authorization)"\s*:\s*")[^"]*/gi,
        "$1[REDACTED]",
      );
  const timer = setTimeout(
    () => controller.abort(),
    action === "reconcile_all" ? RECONCILE_TIMEOUT_MS : REPORT_TIMEOUT_MS,
  );
  const debugReport =
    action === "vsl_report" &&
    process.env["NODE_ENV"] !== "production" &&
    process.env["REPORTS_DEBUG"] === "true";
  const reportLog = (label: string, value: unknown) => {
    if (debugReport)
      console.info(`[REPORTS] ${label}`, redact(JSON.stringify(value)).slice(0, 16000));
  };
  reportLog("Request received / Query params", filters);
  reportLog("Apps Script URL", url.toString());
  if (action === "reconcile_all")
    console.info("[reconcile_all] started", { timeoutMs: RECONCILE_TIMEOUT_MS });
  try {
    const response = await fetch(url, {
      method: action === "reconcile_all" ? "POST" : "GET",
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    if (action === "reconcile_all") {
      const text = await response.text();
      console.info("[reconcile_all] Apps Script response", {
        status: response.status,
        durationMs: Date.now() - startedAt,
        contentType: response.headers.get("content-type"),
        body: redact(text).slice(0, 16000),
      });
      if (!response.ok)
        throw new ApiError(
          `Apps Script respondió HTTP ${response.status}. Consulta los logs de reconciliación.`,
        );
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError(
          "Apps Script devolvió una respuesta no JSON. Consulta los logs de reconciliación.",
        );
      }
      if (!body || typeof body !== "object" || !("ok" in body) || body.ok !== true) {
        const detail =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? `: ${redact(body.error).slice(0, 300)}`
            : ". Consulta los logs de reconciliación.";
        throw new ApiError(`Apps Script rechazó la reconciliación${detail}`);
      }
      return body;
    }
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    reportLog("Apps Script response", {
      status: response.status,
      contentType,
      redirected: response.redirected,
      durationMs: Date.now() - startedAt,
      bytes: new TextEncoder().encode(text).length,
      rawResponse: redact(text).slice(0, 16000),
    });
    const failure = (details: string) =>
      new ApiError("Apps Script request failed", 502, {
        upstreamStatus: response.status,
        contentType,
        details: redact(details).slice(0, 16000),
      });
    if (!response.ok) throw failure(`HTTP ${response.status}: ${text}`);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw failure(`Respuesta no JSON (${contentType ?? "sin Content-Type"}): ${text}`);
    }
    reportLog("Parsed response", body);
    if (!body || typeof body !== "object" || !("ok" in body) || body.ok !== true)
      throw failure(JSON.stringify(body));
    return body;
  } catch (error) {
    if (action === "vsl_report")
      reportLog("Request failed", {
        durationMs: Date.now() - startedAt,
        timedOut: controller.signal.aborted,
        error: error instanceof Error ? error.message : String(error),
        diagnostics: error instanceof ApiError ? error.diagnostics : undefined,
      });
    if (action === "reconcile_all" && !(error instanceof ApiError)) {
      const cause = error instanceof Error ? error.cause : undefined;
      console.error("[reconcile_all] fetch/read failed", {
        durationMs: Date.now() - startedAt,
        timedOut: controller.signal.aborted,
        error: redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error)),
        cause: redact(
          cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause ?? ""),
        ),
      });
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? "Apps Script excedió el tiempo de espera. Consulta el reporte antes de reintentar la actualización."
        : "No se pudo obtener una respuesta JSON válida de Apps Script.",
      controller.signal.aborted ? 504 : 502,
      action === "vsl_report"
        ? {
            details: redact(
              error instanceof Error
                ? `${error.name}: ${error.message}; cause: ${String(error.cause ?? "")}`
                : String(error),
            ).slice(0, 16000),
          }
        : undefined,
    );
  } finally {
    clearTimeout(timer);
  }
}
export function fetchVslReport(filters: ReportRequest) {
  return requestScript("vsl_report", filters);
}
export function fetchAppointmentDetail(filters: AppointmentDetailRequest) {
  return requestScript("appointment_detail", filters);
}
export function runVslReconciliation() {
  return requestScript("reconcile_all");
}
