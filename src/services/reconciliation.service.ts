import type { ReconciliationResult } from "@/types/reconciliation.types";
import { readResponse } from "./reports";
export async function triggerVslReconciliation(): Promise<ReconciliationResult> {
  return readResponse(
    await fetch("/api/reports/vsl-closers/reconcile", {
      method: "POST",
      headers: { "x-report-request": "1" },
    }),
  );
}
