import { surveyDetailSchema } from "../../lib/survey-detail";
import { fetchVslJson } from "../adapters/vsl-quality.adapter.server";
const pending = new Map<string, Promise<Response>>();
const headers = { "Cache-Control": "private, no-store" };
async function load(month: string, status: string) {
  try {
    const parsed = surveyDetailSchema.safeParse(
      await fetchVslJson({ action: "detail", month, status }),
    );
    if (!parsed.success)
      throw new Error(
        "El Apps Script no devuelve el contrato de action=detail (16 columnas y filas como arrays). Verifica el despliegue actualizado.",
      );
    if (parsed.data.month !== month || parsed.data.status !== status)
      throw new Error("El detalle recibido no corresponde al mes y estado solicitados.");
    return Response.json(parsed.data, { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar el detalle." },
      { status: 502, headers },
    );
  }
}
export async function surveyDetailApi(request: Request) {
  const params = new URL(request.url).searchParams,
    month = params.get("month") ?? "",
    status = params.get("status") ?? "";
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    !["CONFIRMADO", "ASISTIÓ", "CANCELADO", "NO ASISTIÓ", "OTRO"].includes(status)
  )
    return Response.json({ error: "Mes o estado de agenda inválido." }, { status: 400, headers });
  const key = `${month}/${status}`;
  let work = pending.get(key);
  if (!work) {
    work = load(month, status).finally(() => pending.delete(key));
    pending.set(key, work);
  }
  return (await work).clone();
}
