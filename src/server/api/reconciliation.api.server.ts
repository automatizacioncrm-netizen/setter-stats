import { reconcileVslReport } from "../services/reconciliation.server";
import { apiError, ApiError } from "../config/env.server";
export async function reconciliationApi(request: Request) {
  try {
    if (
      request.headers.get("x-report-request") !== "1" ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new ApiError("Solicitud de actualización no permitida.", 403);
    const action = new URL(request.url).searchParams.get("action") || "reconcile_all";
    if (
      action !== "reconcile_all" &&
      action !== "reconcile_opportunities" &&
      action !== "reconcile_appointments"
    )
      throw new ApiError("Acción de reconciliación no válida.", 400);
    return Response.json(await reconcileVslReport(action), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
