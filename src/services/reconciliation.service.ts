import type { ReconciliationResult } from "@/types/reconciliation.types";
import { readResponse } from "./reports";
export async function triggerVslReconciliation(
  action: "reconcile_all" | "reconcile_opportunities" | "reconcile_appointments" = "reconcile_all",
): Promise<ReconciliationResult> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await readResponse<ReconciliationResult>(
      await fetch(`/api/reports/vsl-closers/reconcile?action=${action}`, {
        method: "POST",
        headers: { "x-report-request": "1" },
      }),
    );
    if (!result.ok || result.completed !== false) return result;
    if (result.nextAction !== action)
      throw new Error("La API no indicó cómo continuar la reconciliación.");
  }
  throw new Error("La reconciliación continúa pendiente. Puedes retomarla desde su checkpoint.");
}
