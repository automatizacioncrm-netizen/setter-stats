import type { Appointment } from "@/lib/appointments";
import { readResponse } from "./reports";

export async function getAppointments(signal?: AbortSignal) {
  try {
    return await fetch("/api/reports/vsl-citas", {
      ...(signal ? { signal } : {}),
      cache: "no-store",
    }).then(readResponse<{ appointments: Appointment[]; invalid: number }>);
  } catch {
    throw new Error("No se pudieron cargar los datos de citas.");
  }
}
export async function triggerAppointmentsReconciliation() {
  const result = await readResponse<{ ok: boolean }>(
    await fetch("/api/reports/vsl-citas/reconcile", { method: "POST" }),
  );
  if (result.ok !== true) throw new Error("No se pudo completar la actualización de citas.");
}
