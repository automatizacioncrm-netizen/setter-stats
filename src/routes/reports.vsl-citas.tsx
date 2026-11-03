import { createFileRoute } from "@tanstack/react-router";
import { ConsultantsDashboard } from "@/components/reports/ConsultantsDashboard";
export const Route = createFileRoute("/reports/vsl-citas")({
  head: () => ({ meta: [{ title: "CONSULTOR | CITAS Y CALENDARIOS" }] }),
  component: ConsultantsDashboard,
});
