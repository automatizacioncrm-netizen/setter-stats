import { validateAppointmentsByFunnel } from "../../lib/appointments-by-funnel";
import { limaDay, validateRange, type DateRange } from "../../lib/vsl-date-range";
import { managementPeriods } from "../../lib/management-period";
import { fetchVslJson, VslTransportError } from "../adapters/vsl-quality.adapter.server";
import { qualityReportSchema } from "../../lib/vsl-quality";
let operational = false;
const inFlight = new Map<string, Promise<Response>>();
export function qualityStatus() {
  return Response.json({ available: operational }, { headers: { "Cache-Control": "no-store" } });
}
async function loadReport(range?: DateRange): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    const raw = await fetchVslJson({ action: "report", ...(range ?? {}) });
    if (raw && typeof raw === "object" && !("surveyStatus" in raw))
      throw new Error(
        "La API no incluye surveyStatus. Actualiza o ejecuta la versión del reporte de Google Apps Script que genera el desglose por estado.",
      );
    const result = qualityReportSchema.safeParse(raw);
    if (!result.success)
      throw new Error(
        "Contrato inválido: " +
          result.error.issues
            .map((issue) => issue.path.join(".") + ": " + issue.message)
            .join("; "),
      );
    if (
      range &&
      (result.data.filter?.startDate !== range.startDate ||
        result.data.filter?.endDate !== range.endDate)
    )
      throw new Error(
        "La API no confirmó el filtro solicitado. No se muestran agregados históricos como datos del intervalo.",
      );
    if (!range && result.data.filter)
      throw new Error("La API devolvió un filtro inesperado para Todo el histórico.");
    const periods =
      !range && result.data.periods && result.data.dataThrough
        ? managementPeriods(result.data.periods, result.data.dataThrough, limaDay())
        : undefined;
    const oldest = periods?.at(-1);
    const newest = periods?.[0];
    const funnel = validateAppointmentsByFunnel(
      raw && typeof raw === "object" && "appointmentsByFunnel" in raw
        ? raw.appointmentsByFunnel
        : undefined,
      range ?? (oldest && newest ? { startDate: oldest.from, endDate: newest.to } : undefined),
    );
    operational = true;
    return Response.json(
      {
        ...result.data,
        appointmentsByFunnel: funnel.data,
        appointmentsByFunnelError: funnel.error,
        queriedAt: new Date().toISOString(),
      },
      { headers },
    );
  } catch (error) {
    operational = false;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "No se pudo cargar el reporte.",
        code: error instanceof VslTransportError ? error.code : "CONTRACT",
      },
      {
        status: error instanceof VslTransportError && error.code === "TIMEOUT" ? 504 : 502,
        headers,
      },
    );
  }
}
export async function qualityApi(request?: Request) {
  const params = request ? new URL(request.url).searchParams : undefined;
  let range: DateRange | undefined;
  if (params?.has("startDate") || params?.has("endDate")) {
    range = { startDate: params.get("startDate") ?? "", endDate: params.get("endDate") ?? "" };
    const error = validateRange(range);
    if (error)
      return Response.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const key = range ? range.startDate + "/" + range.endDate : "all";
  let work = inFlight.get(key);
  if (!work) {
    work = loadReport(range).finally(() => inFlight.delete(key));
    inFlight.set(key, work);
  }
  return (await work).clone();
}
