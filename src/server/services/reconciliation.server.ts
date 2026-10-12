import { runVslReconciliation } from "../adapters/apps-script.adapter.server";
import { mapReconciliationResponse } from "../mappers/reconciliation.mapper";
import type { ReconciliationAction } from "../adapters/apps-script.adapter.server";
export async function reconcileVslReport(action: ReconciliationAction = "reconcile_all") {
  return mapReconciliationResponse(await runVslReconciliation(action));
}
