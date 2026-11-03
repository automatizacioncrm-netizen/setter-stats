import { consultantsSchema } from "../../lib/consultants-report";
let pending: Promise<Response> | undefined;
async function loadConsultants() {
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
      response = await fetch(configured, { method: "GET", signal: AbortSignal.timeout(30000) });
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
        error:
          error instanceof Error ? error.message : "No se pudo cargar el reporte de consultores.",
      },
      { status: 502, headers },
    );
  }
}
export async function consultantsApi() {
  pending ??= loadConsultants().finally(() => {
    pending = undefined;
  });
  return (await pending).clone();
}
