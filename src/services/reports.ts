import type { DetailQuery, ReportFilters, VslClosersReport } from "@/types/reports";
export async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "No se pudo completar la solicitud.");
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
        ([key]) => key !== "leadType" || filters.pipeline === undefined || filters.pipeline === "vsl",
      )
      .map(([k, v]) => [k, String(v)]),
  );
  return readResponse(
    await fetch(`/api/reports/vsl-closers?${params}`, {
      ...(signal ? { signal } : {}),
      cache: "no-store",
    }),
  );
}
