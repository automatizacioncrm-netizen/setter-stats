import { createFileRoute } from "@tanstack/react-router";
import { appointmentsApi } from "@/server/api/appointments.api.server";
export const Route = createFileRoute("/api/reports/vsl-citas")({
  server: { handlers: { GET: () => appointmentsApi() } },
});
