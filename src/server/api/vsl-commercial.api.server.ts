import { fetchVslJson } from "../adapters/vsl-quality.adapter.server";
import {
  commercialCloserSchema,
  commercialClosersSchema,
  commercialSchema,
} from "../../lib/vsl-commercial";
const pending = new Map<string, Promise<Response>>();
export async function commercialApi(request: Request) {
  const params = new URL(request.url).searchParams;
  const action = params.get("action");
  const month = params.get("month") ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (action === "commercial_closers" || action === "commercial_closer") {
    const closer = params.get("closer");
    if (action === "commercial_closer" && !closer?.trim())
      return Response.json({ error: "Selecciona un closer válido." }, { status: 400, headers });
    try {
      const raw = await fetchVslJson(
        action === "commercial_closers" ? { action } : { action, closer: closer! },
      );
      const parsed = (
        action === "commercial_closers" ? commercialClosersSchema : commercialCloserSchema
      ).safeParse(raw);
      if (!parsed.success) throw new Error("La API devolvió un reporte por closer inválido.");
      if ("closer" in parsed.data && parsed.data.closer !== closer)
        throw new Error("El closer recibido no coincide con el solicitado.");
      return Response.json(parsed.data, { headers });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : "No se pudo consultar el reporte por closer.",
        },
        { status: 502, headers },
      );
    }
  }
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
