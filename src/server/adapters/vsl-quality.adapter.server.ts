// Shared private transport for the VSL report and on-demand survey audit.
export async function fetchVslJson(params: Record<string, string> = {}): Promise<unknown> {
  const value = process.env["APPS_SCRIPT_URL_VSL"];
  if (!value) throw new Error("Configura APPS_SCRIPT_URL_VSL en el servidor.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APPS_SCRIPT_URL_VSL no es una URL válida.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
  )
    throw new Error("Se requiere una URL HTTPS de despliegue de Google Apps Script.");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      if (attempt === 0) continue;
      throw new Error("No se pudo conectar con el reporte o se agotó el tiempo de espera.");
    }
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
    break;
  }
  if (!response?.ok)
    throw new Error(
      `El servicio del reporte respondió HTTP ${response?.status ?? 502}. Revisa el despliegue y sus permisos.`,
    );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "El Apps Script no devuelve JSON. Se necesita un endpoint doGet compatible y accesible.",
    );
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error("El servicio devolvió JSON vacío o inválido.");
  }
  if (raw && typeof raw === "object" && "success" in raw && raw.success === false) {
    const message = "error" in raw ? raw.error : "message" in raw ? raw.message : undefined;
    let safe =
      typeof message === "string" ? message : "Apps Script indicó success: false sin descripción.";
    for (const secret of url.searchParams.values())
      if (secret) safe = safe.replaceAll(secret, "[REDACTADO]");
    safe = safe.replace(/https?:\/\/[^\s<>"']+/gi, "[URL OMITIDA]");
    throw new Error("Apps Script: " + safe.slice(0, 1000));
  }

  return raw;
}
