import { syncStateSchema } from "../../lib/vsl-sync";
import { fetchVslJson } from "../adapters/vsl-quality.adapter.server";
const headers = { "Cache-Control": "private, no-store" };
let starting: Promise<Response> | undefined;
function clean(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/https?:\/\/[^\s<>"']+/gi, "[URL OMITIDA]");
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(token|secret)/i.test(key))
        .map(([key, v]) => [key, clean(v)]),
    );
  return value;
}
function parseState(raw: unknown) {
  const candidate = raw && typeof raw === "object" && "job" in raw ? raw.job : raw;
  const parsed = syncStateSchema.safeParse(candidate);
  if (!parsed.success)
    throw new Error(
      "La respuesta de syncstatus no cumple el contrato de job.status, stage y completedStages. Verifica el despliegue del orquestador.",
    );
  return syncStateSchema.parse(clean(parsed.data));
}
async function status() {
  return parseState(await fetchVslJson({ action: "syncstatus" }));
}
function failure(error: unknown) {
  return Response.json(
    {
      error: clean(
        error instanceof Error ? error.message : "No se pudo consultar la sincronización.",
      ),
    },
    { status: 502, headers },
  );
}
export async function vslSyncStatusApi() {
  try {
    return Response.json(await status(), { headers });
  } catch (error) {
    return failure(error);
  }
}
async function start() {
  try {
    const current = await status();
    if (current.status === "QUEUED" || current.status === "RUNNING")
      return Response.json(current, { headers });
    const raw = await fetchVslJson({}, { method: "POST", body: { action: "refresh" } });
    if (!raw || typeof raw !== "object" || !("success" in raw) || raw.success !== true)
      throw new Error(
        "Apps Script no confirmó la solicitud de actualización. Consulta el estado antes de reintentar.",
      );
    return Response.json("job" in raw ? parseState(raw) : await status(), { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function vslSyncStartApi(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Solicitud no permitida." }, { status: 403, headers });
  if (!starting)
    starting = start().finally(() => {
      starting = undefined;
    });
  return (await starting).clone();
}
