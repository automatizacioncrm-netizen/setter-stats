import { z } from "zod";
import { appointmentsPayload, normalizeAppointments } from "../../lib/appointments";
import { fetchAppointments, reconcileAppointments } from "../adapters/appointments.adapter.server";
import { ApiError, apiError } from "../config/env.server";

export async function appointmentsApi() {
  try {
    const parsed = appointmentsPayload
      .omit({ rows: true })
      .extend({ data: appointmentsPayload.shape.rows })
      .safeParse(await fetchAppointments());
    if (!parsed.success) throw new ApiError("El servicio de citas devolvió datos inválidos.");
    // Only report fields leave the server, never contact PII or credentials.
    return Response.json(normalizeAppointments(parsed.data.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function appointmentsReconcileApi(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new ApiError("Solicitud no permitida.", 403);
    const result = z.object({ ok: z.literal(true) }).safeParse(await reconcileAppointments());
    if (!result.success) throw new ApiError("No se pudo completar la actualización de citas.");
    return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
