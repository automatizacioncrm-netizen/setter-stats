import { embudos, settersReportSchema } from "../../lib/setters-report";
import { limaDay, validDate } from "../../lib/vsl-date-range";

export async function settersApi(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const error = (message: string, status = 502) =>
    Response.json({ error: message }, { status, headers });

  const configured = process.env["APPS_SCRIPT_URL_SETTERS"];
  if (!configured?.trim()) return error("Reporte no configurado", 503);

  const params = new URL(request.url).searchParams;
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const hasRange = desde !== null || hasta !== null;
  const fecha = params.get("fecha") ?? limaDay();
  const embudo = params.get("embudo");
  if (hasRange) {
    if (!desde || !hasta || !validDate(desde) || !validDate(hasta) || desde > hasta)
      return error("Selecciona un rango válido (YYYY-MM-DD).", 400);
  } else if (!validDate(fecha)) {
    return error("Selecciona una fecha válida (YYYY-MM-DD).", 400);
  }
  if (embudo !== null && !embudos.safeParse(embudo).success)
    return error("Selecciona un embudo válido.", 400);

  const url = URL.canParse(configured) ? new URL(configured) : null;
  if (
    !url ||
    url.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
  )
    return error("La URL del reporte de setters no es válida.");

  url.searchParams.delete("fecha");
  url.searchParams.delete("desde");
  url.searchParams.delete("hasta");
  if (desde !== null && hasta !== null) {
    url.searchParams.set("desde", desde);
    url.searchParams.set("hasta", hasta);
  } else {
    url.searchParams.set("fecha", fecha);
  }
  url.searchParams.delete("embudo");
  if (embudo !== null) url.searchParams.set("embudo", embudo);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.text();
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      if (/^\s*</.test(body) || response.headers.get("content-type")?.includes("text/html"))
        return error("El Apps Script de setters no está accesible.");
    }
    if (raw && typeof raw === "object" && "ok" in raw && raw.ok === false) {
      if ("error" in raw && typeof raw.error === "string") return error(raw.error);
      return error("El servicio de setters informó que no pudo generar el reporte.");
    }

    if (!response.ok)
      return error(`El servicio de setters respondió con un error HTTP ${response.status}.`);
    if (!settersReportSchema.safeParse(raw).success)
      return error("El servicio de setters devolvió un reporte inválido.");
    return new Response(body, { headers: { ...headers, "Content-Type": "application/json" } });
  } catch {
    return error("No se pudo conectar con el servicio de setters o se agotó el tiempo de espera.");
  }
}
