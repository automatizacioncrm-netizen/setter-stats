import { commercialTrendsSchema, trendMonths } from "../../lib/commercial-trends";
import { fetchVslJson, VslTransportError } from "../adapters/vsl-quality.adapter.server";
const pending = new Map<string, Promise<Response>>();
export async function commercialTrendsApi(request: Request) {
  const params = new URL(request.url).searchParams,
    from = params.get("from") ?? "",
    to = params.get("to") ?? "",
    headers = { "Cache-Control": "no-store" };
  try {
    trendMonths(from, to);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Rango inválido" },
      { status: 400, headers },
    );
  }
  const key = from + "/" + to;
  let work = pending.get(key);
  if (!work) {
    work = (async () => {
      try {
        const raw = await fetchVslJson({ action: "commercial_trends", from, to });
        const parsed = commercialTrendsSchema.safeParse(raw);
        if (!parsed.success)
          throw new Error(
            "Contrato de tendencias inválido: " +
              parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; "),
          );
        if (parsed.data.from !== from || parsed.data.to !== to)
          throw new Error("La API devolvió tendencias de otro período.");
        return Response.json(parsed.data, { headers });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudieron cargar las tendencias.";
        return Response.json(
          {
            error: /Acción no soportada/i.test(message)
              ? "El servicio todavía no tiene habilitadas las tendencias comerciales."
              : message,
          },
          {
            status: error instanceof VslTransportError && error.code === "TIMEOUT" ? 504 : 502,
            headers,
          },
        );
      }
    })().finally(() => pending.delete(key));
    pending.set(key, work);
  }
  return (await work).clone();
}
