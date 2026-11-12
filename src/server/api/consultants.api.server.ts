import { consultantsSchema } from "../../lib/consultants-report";
import { occupancySchema } from "../../lib/consultant-occupancy";
let pending: Promise<Response> | undefined;
async function loadConsultants(occupancy?: { params: URLSearchParams; signal: AbortSignal }) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const configured = process.env["APPS_SCRIPT_CONSULTORES_URL"];
    if (!configured) throw new Error("Configura APPS_SCRIPT_CONSULTORES_URL en el servidor.");
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("APPS_SCRIPT_CONSULTORES_URL no es válida.");
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
    )
      throw new Error(
        "Se requiere una URL pública HTTPS de Google Apps Script terminada en /exec.",
      );
    let response: Response;
    try {
      // Public Web App: URL unchanged, GET without headers, parameters or credentials.
      const timeout = AbortSignal.timeout(30000);
      if (occupancy) {
        url.searchParams.set("action", "ocupacion");
        for (const key of ["week", "mes", "desde", "hasta", "estructura", "usuario", "agrupar"]) {
          const value = occupancy.params.get(key);
          if (value) url.searchParams.set(key, value);
        }
        response = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.any([timeout, occupancy.signal]),
        });
      } else {
        response = await fetch(configured, { method: "GET", signal: timeout });
      }
    } catch {
      throw new Error("No se pudo conectar con consultores o se agotó el tiempo de espera.");
    }
    if (response.status !== 200)
      throw new Error(`El servicio de consultores respondió HTTP ${response.status}.`);
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new Error("El servicio de consultores devolvió JSON vacío o inválido.");
    }
    if (occupancy) {
      const parsed = occupancySchema.safeParse(raw);
      if (parsed.success) return Response.json(parsed.data, { headers });
      return Response.json(
        {
          error:
            raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string"
              ? raw.error
              : "No se pudo cargar la ocupación",
        },
        { status: 502, headers },
      );
    }
    if (raw && typeof raw === "object" && "success" in raw && raw.success === false)
      throw new Error("El servicio de consultores informó que no pudo generar el reporte.");
    const parsed = consultantsSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        "Contrato de consultores inválido: " +
          parsed.error.issues
            .map((issue) => issue.path.join(".") + ": " + issue.message)
            .join("; "),
      );
    return Response.json(parsed.data, { headers });
  } catch (error) {
    return Response.json(
      {
        error: occupancy
          ? "No se pudo cargar la ocupación"
          : error instanceof Error
            ? error.message
            : "No se pudo cargar el reporte de consultores.",
      },
      { status: 502, headers },
    );
  }
}
export async function consultantsApi(request?: Request) {
  if (request) {
    const params = new URL(request.url).searchParams;
    if (params.get("action") === "ocupacion") {
      return loadConsultants({ params, signal: request.signal });
    }
  }
  pending ??= loadConsultants().finally(() => {
    pending = undefined;
  });
  return (await pending).clone();
}
