import { ApiError } from "../config/env.server";

// Independent, server-side read integration. This Apps Script does not use a secret.
export async function fetchAppointments(): Promise<unknown> {
  const baseUrl = process.env["APPS_SCRIPT_CITAS_URL"];
  if (!baseUrl?.trim()) throw new ApiError("APPS_SCRIPT_CITAS_URL no configurada", 500);

  let url: URL;
  try {
    url = new URL(baseUrl.trim());
    if (url.protocol !== "https:") throw new Error("Invalid protocol");
  } catch {
    throw new ApiError("APPS_SCRIPT_CITAS_URL no válida", 500);
  }
  url.searchParams.set("action", "report");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const startedAt = Date.now();
  let stage = "fetch";
  let httpStatus: number | undefined;
  console.info("[vsl-citas] inicio de llamada");
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    httpStatus = response.status;
    console.info("[vsl-citas] status HTTP de Apps Script:", httpStatus);
    stage = "lectura de respuesta";
    const text = await response.text();
    if (!response.ok) {
      stage = "error HTTP";
      throw new ApiError("No se pudieron cargar los datos de citas.");
    }
    stage = "parseo JSON";
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("Apps Script devolvió una respuesta que no es JSON válido.");
    }
    return body;
  } catch (error) {
    const aborted =
      controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
    // Never log raw errors or response bodies: they may include URLs or credentials.
    const cause = error instanceof Error ? error.cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    console.error("[vsl-citas] error upstream:", {
      stage,
      httpStatus,
      reason: aborted
        ? "Timeout de 120000 ms o solicitud abortada"
        : error instanceof ApiError
          ? error.message
          : "Fallo de red o de lectura de respuesta",
      ...(typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? { code } : {}),
    });
    if (aborted) throw new ApiError("El servicio de citas tardó demasiado en responder.", 504);
    if (error instanceof ApiError) throw error;
    throw new ApiError("No se pudieron cargar los datos de citas.", 502);
  } finally {
    clearTimeout(timer);
    console.info("[vsl-citas] duración total en ms:", Date.now() - startedAt);
  }
}
export async function reconcileAppointments(): Promise<unknown> {
  const baseUrl = process.env["APPS_SCRIPT_CITAS_URL"];
  if (!baseUrl?.trim()) throw new ApiError("APPS_SCRIPT_CITAS_URL no configurada.", 500);

  let url: URL;
  try {
    url = new URL(baseUrl.trim());
    if (url.protocol !== "https:") throw new Error("Invalid protocol");
  } catch {
    throw new ApiError("APPS_SCRIPT_CITAS_URL no válida.", 500);
  }
  url.searchParams.set("action", "reconcile");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error("[vsl-citas/reconcile] Apps Script HTTP", response.status);
      throw new ApiError("No se pudo reconciliar la información de citas.", 502);
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error("[vsl-citas/reconcile] respuesta no JSON");
      throw new ApiError("Apps Script devolvió una respuesta inválida.", 502);
    }
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new ApiError("La reconciliación de citas tardó demasiado en responder.", 504);
    }
    if (error instanceof ApiError) throw error;
    console.error("[vsl-citas/reconcile] error de red o de lectura de respuesta");
    throw new ApiError("No se pudo reconciliar la información de citas.", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
