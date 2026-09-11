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
  const failureMessage = "No se pudieron actualizar los datos de citas.";
  let response: Response;
  try {
    response = await fetch("/api/reports/vsl-citas/reconcile", { method: "POST" });
  } catch {
    throw new Error(failureMessage);
  }
  if (response.status === 504) {
    throw new Error("La actualización tardó demasiado. Intenta nuevamente.");
  }
  if (!response.ok) throw new Error(failureMessage);
  try {
    const result = await response.json();
    if (result?.ok !== true) throw new Error(failureMessage);
  } catch {
    throw new Error(failureMessage);
  }
}
