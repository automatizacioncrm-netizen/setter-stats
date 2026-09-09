import { createFileRoute } from "@tanstack/react-router";
import { appointmentsReconcileApi } from "@/server/api/appointments.api.server";
export const Route = createFileRoute("/api/reports/vsl-citas/reconcile")({
  server: { handlers: { POST: ({ request }) => appointmentsReconcileApi(request) } },
});
