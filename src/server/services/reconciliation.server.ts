import { runVslReconciliation } from "../adapters/apps-script.adapter.server";
import { mapReconciliationResponse } from "../mappers/reconciliation.mapper";
export async function reconcileVslReport() {
  return mapReconciliationResponse(await runVslReconciliation());
}
