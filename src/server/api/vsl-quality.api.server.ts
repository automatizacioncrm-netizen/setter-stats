import { fetchVslJson } from "../adapters/vsl-quality.adapter.server";
import { qualityReportSchema } from "../../lib/vsl-quality";
let operational = false;
let inFlight: Promise<Response> | undefined;
export function qualityStatus() {
  return Response.json({ available: operational }, { headers: { "Cache-Control": "no-store" } });
}
async function loadReport(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    const raw = await fetchVslJson({ action: "report" });
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
    operational = true;
    return Response.json({ ...result.data, queriedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    operational = false;
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el reporte." },
      { status: 502, headers },
    );
  }
}
export async function qualityApi() {
  if (!inFlight)
    inFlight = loadReport().finally(() => {
      inFlight = undefined;
    });
  return (await inFlight).clone();
}
