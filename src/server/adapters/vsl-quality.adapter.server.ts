// Shared private transport for the VSL report and on-demand survey audit.
export async function fetchVslJson(
  params: Record<string, string> = {},
  options: { method?: "GET" | "POST"; body?: Record<string, string> } = {},
): Promise<unknown> {
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
  const configuredValues = [...url.searchParams.values()];
  for (const key of [...url.searchParams.keys()])
    if (/^(token|refreshToken)$/i.test(key)) url.searchParams.delete(key);
  if (params["action"] === "report") {
    url.searchParams.delete("startDate");
    url.searchParams.delete("endDate");
  }
  for (const [key, value] of Object.entries(params))
    if (!/^(token|refreshToken)$/i.test(key)) url.searchParams.set(key, value);
  let response: Response | undefined;
  for (let attempt = 0; attempt < (options.method === "POST" ? 1 : 2); attempt++) {
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
      });
    } catch {
      if (attempt === 0 && options.method !== "POST") continue;
      throw new Error("No se pudo conectar con el reporte o se agotó el tiempo de espera.");
    }
    if (
      attempt === 0 &&
      options.method !== "POST" &&
      (response.status === 429 || response.status >= 500)
    )
      continue;
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
    for (const secret of [
      ...configuredValues,
      ...url.searchParams.values(),
      ...(options.body ? Object.values(options.body) : []),
    ])
      if (secret) safe = safe.replaceAll(secret, "[REDACTADO]");
    safe = safe.replace(/https?:\/\/[^\s<>"']+/gi, "[URL OMITIDA]");
    throw new Error("Apps Script: " + safe.slice(0, 1000));
  }

  return raw;
}
