import { timingSafeEqual } from "node:crypto";
import { ApiError, apiError, getCronSecret } from "../config/env.server";
import { reconcileVslReport } from "../services/reconciliation.server";
export async function cronReconciliationApi(request: Request) {
  try {
    const expected = Buffer.from(`Bearer ${getCronSecret()}`);
    const received = Buffer.from(request.headers.get("authorization") ?? "");
    if (received.length !== expected.length || !timingSafeEqual(received, expected))
      throw new ApiError("No autorizado.", 401);
    const result = await reconcileVslReport();
    const ok = result.ok && result.errors === 0;
    console.info("VSL cron reconciliation", {
      ok,
      reviewed: result.reviewed,
      inserted: result.inserted,
      updated: result.updated,
      errors: result.errors,
      durationSeconds: result.durationSeconds,
    });
    return Response.json(
      { ok, inserted: result.inserted, updated: result.updated, errors: result.errors },
      { status: ok ? 200 : 502, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.warn("VSL cron request failed", {
      status: error instanceof ApiError ? error.status : 500,
    });
    return apiError(error);
  }
}
