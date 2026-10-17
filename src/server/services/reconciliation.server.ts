import { runVslReconciliation } from "../adapters/apps-script.adapter.server";
import { mapReconciliationResponse } from "../mappers/reconciliation.mapper";
import type { ReconciliationAction } from "../adapters/apps-script.adapter.server";
import type { ReconciliationPipeline } from "../../types/reconciliation.types";
export async function reconcileVslReport(
  action: ReconciliationAction = "reconcile_all",
  pipeline: ReconciliationPipeline = "all",
) {
  return mapReconciliationResponse(await runVslReconciliation(action, pipeline));
}
