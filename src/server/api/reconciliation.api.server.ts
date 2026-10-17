import { reconcileVslReport } from "../services/reconciliation.server";
import { apiError, ApiError } from "../config/env.server";
import {
  RECONCILIATION_PIPELINES,
  type ReconciliationPipeline,
} from "../../types/reconciliation.types";
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
    const pipeline = new URL(request.url).searchParams.get("pipeline") ?? "all";
    if (!Object.hasOwn(RECONCILIATION_PIPELINES, pipeline))
      throw new ApiError("Embudo de actualización no válido.", 400);
    return Response.json(await reconcileVslReport(action, pipeline as ReconciliationPipeline), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
