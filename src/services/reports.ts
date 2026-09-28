import { getEffectiveSetter, getEffectiveVslOrigin } from "../lib/report-record";
import type { DetailQuery, ReportFilters, VslClosersReport } from "@/types/reports";
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
