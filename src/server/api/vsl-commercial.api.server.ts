import { fetchVslJson } from "../adapters/vsl-quality.adapter.server";
import { commercialSchema } from "../../lib/vsl-commercial";
const pending = new Map<string, Promise<Response>>();
export async function commercialApi(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return Response.json({ error: "Mes inválido: usa YYYY-MM." }, { status: 400, headers });
  let work = pending.get(month);
  if (!work) {
    work = (async () => {
      try {
        const raw = await fetchVslJson({ action: "commercial", month });
        const parsed = commercialSchema.safeParse(raw);
        if (!parsed.success)
          throw new Error(
            "Contrato comercial inválido: " +
              parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; "),
          );
        if (parsed.data.month !== month)
          throw new Error("La API devolvió un mes diferente al solicitado.");
        return Response.json(parsed.data, { headers });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : "No se pudo consultar el reporte comercial.",
          },
          { status: 502, headers },
        );
      }
    })().finally(() => pending.delete(month));
    pending.set(month, work);
  }
  return (await work).clone();
}
