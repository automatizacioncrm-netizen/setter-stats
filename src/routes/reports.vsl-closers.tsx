import { createFileRoute } from "@tanstack/react-router";
import { VslClosersDashboard } from "@/pages/VslClosersDashboard";

export const Route = createFileRoute("/reports/vsl-closers")({
  head: () => ({
    meta: [
      { title: "Reporte comercial VSL | CLOSERS + OEI" },
      {
        name: "description",
        content: "Agenda y desempeño comercial por embudo y Setter.",
      },
      { property: "og:title", content: "Reporte comercial VSL | CLOSERS + OEI" },
      {
        property: "og:description",
        content: "Seguimiento de agenda y desempeño por Setter.",
      },
    ],
  }),
  component: VslClosersDashboard,
});
