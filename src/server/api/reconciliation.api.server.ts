import { reconcileVslReport } from "../services/reconciliation.server";
import { apiError, ApiError } from "../config/env.server";
export async function reconciliationApi(request: Request) {
  try {
    if (
      request.headers.get("x-report-request") !== "1" ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new ApiError("Solicitud de actualización no permitida.", 403);
    return Response.json(await reconcileVslReport(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
