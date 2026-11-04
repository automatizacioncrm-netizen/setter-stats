// Private, shared transport. One bounded 60-second budget including redirects/body/retries.
export class VslTransportError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "VslTransportError";
  }
}
export const VSL_REQUEST_TIMEOUT_MS = 60000;
export async function fetchVslJson(
  params: Record<string, string> = {},
  options: { method?: "GET" | "POST"; body?: Record<string, string> } = {},
): Promise<unknown> {
  const value = process.env["APPS_SCRIPT_URL_VSL"];
  if (!value)
    throw new VslTransportError("CONFIGURATION", "Configura APPS_SCRIPT_URL_VSL en el servidor.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VslTransportError("CONFIGURATION", "APPS_SCRIPT_URL_VSL no es una URL válida.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
  )
    throw new VslTransportError(
      "CONFIGURATION",
      "Se requiere una URL HTTPS de despliegue de Google Apps Script.",
    );
  const configuredValues = [...url.searchParams.values()];
  for (const key of [...url.searchParams.keys()])
    if (/^(token|refreshToken)$/i.test(key)) url.searchParams.delete(key);
  if (params["action"] === "report") {
    url.searchParams.delete("startDate");
    url.searchParams.delete("endDate");
  }
  for (const [key, value] of Object.entries(params))
    if (!/^(token|refreshToken)$/i.test(key)) url.searchParams.set(key, value);
  const redact = (message: string) => {
    for (const secret of [
      ...configuredValues,
      ...url.searchParams.values(),
      ...Object.values(options.body ?? {}),
    ])
      if (secret) message = message.replaceAll(secret, "[REDACTADO]");
    return message.replace(/https?:\/\/[^\s<>"']+/gi, "[URL OMITIDA]").slice(0, 1000);
  };
  const safeUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.origin +
        parsed.pathname.replace(/\/macros\/s\/[^/]+\/exec/, "/macros/s/[DESPLIEGUE]/exec") +
        (parsed.search
          ? "?" + [...parsed.searchParams.keys()].map((key) => key + "=[OMITIDO]").join("&")
          : "")
      );
    } catch {
      return null;
    }
  };
  const started = Date.now(),
    signal = AbortSignal.timeout(VSL_REQUEST_TIMEOUT_MS);
  for (let attempt = 0; attempt < (options.method === "POST" ? 1 : 2); attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        redirect: "follow",
        signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
      });
      if (!response.ok)
        throw new VslTransportError(
          "HTTP",
          `El servicio del reporte respondió HTTP ${response.status}. Revisa el despliegue y sus permisos.`,
        );
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new VslTransportError(
          "CONTENT_TYPE",
          "El Apps Script no devuelve JSON. Se necesita un endpoint doGet compatible y accesible.",
        );
      let raw: unknown;
      try {
        raw = await response.json();
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
        )
          throw error;
        throw new VslTransportError("INVALID_JSON", "El servicio devolvió JSON vacío o inválido.");
      }
      if (raw && typeof raw === "object" && "success" in raw && raw.success === false) {
        const message = "error" in raw ? raw.error : "message" in raw ? raw.message : undefined;
        throw new VslTransportError(
          "UPSTREAM_FAILURE",
          "Apps Script: " +
            redact(
              typeof message === "string"
                ? message
                : "Apps Script indicó success: false sin descripción.",
            ),
        );
      }
      console.info(
        "[vsl-http]",
        JSON.stringify({
          url: safeUrl(url.href),
          action: params["action"] ?? null,
          method: options.method ?? "GET",
          attempt: attempt + 1,
          durationMs: Date.now() - started,
          httpStatus: response.status,
          finalUrl: safeUrl(response.url),
          contentType: response.headers.get("content-type"),
          error: null,
        }),
      );
      return raw;
    } catch (error) {
      const name = error instanceof Error ? error.name : "UnknownError";
      const failure =
        signal.aborted || name === "TimeoutError"
          ? new VslTransportError(
              "TIMEOUT",
              "El reporte excedió el tiempo de espera de 60 segundos.",
            )
          : name === "AbortError"
            ? new VslTransportError("CANCELLED", "La consulta del reporte fue cancelada.")
            : error instanceof VslTransportError
              ? error
              : new VslTransportError(
                  "NETWORK",
                  "No se pudo establecer conexión con Apps Script. Revisa la red y la disponibilidad del servicio.",
                );
      console.warn(
        "[vsl-http]",
        JSON.stringify({
          url: safeUrl(url.href),
          action: params["action"] ?? null,
          method: options.method ?? "GET",
          attempt: attempt + 1,
          durationMs: Date.now() - started,
          httpStatus: response?.status ?? null,
          finalUrl: response?.url ? safeUrl(response.url) : null,
          contentType: response?.headers.get("content-type") ?? null,
          error: {
            type: name,
            code: failure.code,
            message: redact(error instanceof Error ? error.message : String(error)),
            cause:
              error instanceof Error &&
              "cause" in error &&
              error.cause &&
              typeof error.cause === "object" &&
              "code" in error.cause
                ? String(error.cause.code)
                : null,
          },
        }),
      );
      const retry =
        options.method !== "POST" &&
        attempt === 0 &&
        !signal.aborted &&
        (failure.code === "NETWORK" ||
          (failure.code === "HTTP" &&
            (response?.status === 429 || (response?.status ?? 0) >= 500)));
      if (!retry) throw failure;
    }
  }
  throw new VslTransportError("NETWORK", "No se pudo completar la consulta del reporte.");
}
