import { createFileRoute } from "@tanstack/react-router";
import { AppointmentsDashboard } from "@/components/reports/AppointmentsDashboard";
export const Route = createFileRoute("/reports/vsl-citas")({
  head: () => ({ meta: [{ title: "VSL | CITAS Y CALENDARIOS" }] }),
  component: AppointmentsDashboard,
});
