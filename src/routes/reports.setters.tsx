import { createFileRoute } from "@tanstack/react-router";
import { SettersDashboard } from "@/components/reports/SettersDashboard";
import { settersReportTitle } from "@/lib/setters-report";

export const Route = createFileRoute("/reports/setters")({
  head: () => ({ meta: [{ title: settersReportTitle }] }),
  component: SettersDashboard,
});
