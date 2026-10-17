import type { ReconciliationResult } from "@/types/reconciliation.types";
import { readResponse } from "./reports";
import type { ReconciliationPipeline } from "../types/reconciliation.types";
export async function triggerVslReconciliation(
  action: "reconcile_all" | "reconcile_opportunities" | "reconcile_appointments" = "reconcile_all",
  pipeline: ReconciliationPipeline = "all",
  signal?: AbortSignal,
): Promise<ReconciliationResult> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await readResponse<ReconciliationResult>(
      await fetch(
        `/api/reports/vsl-closers/reconcile?${new URLSearchParams({ action, pipeline })}`,
        {
          method: "POST",
          signal: signal ?? null,
          headers: { "x-report-request": "1" },
        },
      ),
    );
    if (!result || result.ok !== true) throw new Error("La API rechazó la actualización.");
    if (typeof result.completed !== "boolean")
      throw new Error("La API no indicó si la actualización terminó.");
    if (result.completed) return result;
  }
  throw new Error("La reconciliación continúa pendiente. Puedes retomarla desde su checkpoint.");
}
